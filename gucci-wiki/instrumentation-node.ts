import type { PrismaClient } from "@prisma/client";

// Логика планировщика — вынесена из instrumentation.ts в отдельный файл,
// require()'нутый только в его node-ветке (см. комментарий там же): файл
// целиком Node-only, Turbopack не должен пытаться собрать его для edge.
//
// `register()` в instrumentation.ts — официальный хук Next.js, вызывается
// один раз при старте серверного процесса (next start внутри Docker-
// контейнера — процесс живёт постоянно, поэтому setInterval здесь безопасен
// и не требует отдельного воркера/очереди — ровно то, что было явно
// заказано: без лишних подсистем).
const RECALCULATE_INTERVAL_MS = 6 * 60 * 60 * 1000; // раз в 6 часов

// Автобэкап БД в S3 (QA-прогон 2, отчёт по отказоустойчивости) — тот же
// принцип "из коробки": пользователь один раз включает чекбокс в /settings,
// дальше система сама льёт дамп в уже настроенный бакет раз в сутки.
const BACKUP_PERIOD_MS = 24 * 60 * 60 * 1000; // не чаще раза в сутки

// Проверяем расписание раз в час, а сам бэкап делаем, только если с
// последнего успешного прошли сутки (QA-прогон 3). Раньше таймер стоял
// прямо на 24 часа от старта процесса — и первый бэкап случался только
// через сутки непрерывной работы, а любой рестарт (деплой — это кнопка,
// которой пользуются) сбрасывал отсчёт. На сервере, который перезапускают
// чаще раза в сутки, суточная отсечка не наступала никогда: чекбокс в
// /settings включён, список бэкапов пуст, и понять почему — неоткуда.
// Отсчёт от Settings.backupLastAt переживает рестарты.
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000; // раз в час

// Мониторинг (место на диске, срок TLS-сертификата, доступность БД, свежесть
// автобэкапа) — раз в час. Интервал выбран под самую медленную из величин:
// диск и сертификат меняются днями, а не минутами, порог тревоги по TLS —
// 3 дня, то есть 72 попытки предупредить. Чаще — это только лишние
// TLS-рукопожатия и запросы к БД без единого нового вывода; реже (раз в
// сутки) — рестарт контейнера мог бы отодвинуть первое оповещение на день.
const MONITORING_INTERVAL_MS = 60 * 60 * 1000; // раз в час

// Next.js может переинициализировать инструментацию при хот-релоаде в
// `next dev` — без этой защиты каждый перезапуск добавлял бы ещё один
// параллельный setInterval поверх старых. Каждый таймер — свой флаг.
const g = globalThis as unknown as {
  __gucciFreshnessTimer?: ReturnType<typeof setInterval>;
  __gucciBackupTimer?: ReturnType<typeof setInterval>;
  __gucciMonitoringTimer?: ReturnType<typeof setInterval>;
};

async function main() {
  const { prisma } = await import("@/lib/db/prisma");

  if (!g.__gucciFreshnessTimer) {
    g.__gucciFreshnessTimer = await startFreshnessTimer();
  }
  if (!g.__gucciBackupTimer) {
    g.__gucciBackupTimer = await startBackupTimer(prisma);
  }
  if (!g.__gucciMonitoringTimer) {
    g.__gucciMonitoringTimer = await startMonitoringTimer();
  }
}

async function startFreshnessTimer(): Promise<ReturnType<typeof setInterval>> {
  const { recalculateAllFreshness } = await import("@/lib/freshness/service");

  // Раньше здесь стоял pg_try_advisory_lock + pg_advisory_unlock двумя
  // отдельными $queryRaw. Это было сломано (QA-прогон 3): advisory-lock
  // без суффикса xact живёт на уровне соединения, а каждый запрос Prisma
  // берёт произвольное соединение из пула — снятие уходило на другое
  // соединение, возвращало false, и лок навсегда оставался висеть на
  // первом. Следующий тик получал locked=false и молча пропускал работу.
  // Здесь лок вообще не нужен: пересчёт идемпотентен, а от дублирования
  // уведомлений защищает pg_advisory_xact_lock внутри транзакции в
  // lib/freshness/notifications.ts (единственное место, где он применён
  // правильно). От наложения тиков внутри одного процесса достаточно
  // флага в замыкании.
  let running = false;

  async function recalculateAll() {
    if (running) return; // предыдущий тик ещё идёт — не наслаиваемся
    running = true;
    try {
      // Пакетно, а не по статье за раз (QA-прогон 4): прежний цикл делал
      // 2-3 запроса на каждую статью и повторял агрегат по пространству
      // столько раз, сколько в этом пространстве статей.
      await recalculateAllFreshness();
    } catch (err) {
      // Тело тика обязано быть завёрнуто целиком: реджект внутри
      // setInterval никто не ловит, а необработанный reject роняет процесс.
      console.error("[freshness] тик пересчёта завершился ошибкой:", err);
    } finally {
      running = false;
    }
  }

  return setInterval(recalculateAll, RECALCULATE_INTERVAL_MS);
}

async function startBackupTimer(prisma: PrismaClient): Promise<ReturnType<typeof setInterval>> {
  const { runBackupIfEnabled } = await import("@/lib/backup/service");

  // Место advisory-lock'а (сломанного, см. комментарий в таймере свежести)
  // занял атомарный «захват слота»: сдвиг backupLastAt через updateMany с
  // условием на него же. Кто из инстансов сходил первым — у того count=1,
  // он и делает бэкап; у остальных count=0, и они тихо пропускают тик.
  // Это одновременно и защита от дублирования, и само расписание.
  async function backupTick() {
    try {
      // Читаем флаг до захвата слота: иначе выключенный бэкап всё равно
      // двигал бы backupLastAt, и в /settings «последний бэкап» показывал
      // бы время, когда никакого бэкапа не было.
      const settings = await prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { backupEnabled: true },
      });
      if (!settings?.backupEnabled) return;

      const dueBefore = new Date(Date.now() - BACKUP_PERIOD_MS);
      const claimed = await prisma.settings.updateMany({
        where: {
          id: "singleton",
          OR: [{ backupLastAt: null }, { backupLastAt: { lt: dueBefore } }],
        },
        data: { backupLastAt: new Date() },
      });
      if (claimed.count === 0) return; // сутки ещё не прошли или слот занял другой инстанс

      // runBackupIfEnabled сам читает актуальный backupEnabled из БД на
      // каждый вызов (не кэшируется между тиками) — включение/выключение
      // в /settings подхватывается со следующего тика без рестарта, и он же
      // перезапишет backupLastAt реальным временем завершения.
      const result = await runBackupIfEnabled();
      if (!result.ok) {
        console.error("[backup] прогон завершился ошибкой:", result.error);
      }
    } catch (err) {
      console.error("[backup] непредвиденная ошибка тика:", err);
    }
  }

  return setInterval(backupTick, BACKUP_CHECK_INTERVAL_MS);
}

async function startMonitoringTimer(): Promise<ReturnType<typeof setInterval>> {
  const { runMonitoringTick } = await import("@/lib/monitoring/service");

  // Лок не нужен по той же причине, что и в таймере свежести: проверки
  // ничего не меняют в БД, а от наложения тиков внутри процесса (медленное
  // TLS-рукопожатие на фоне следующего тика) хватает флага в замыкании.
  // Многоинстансовость дала бы дубль оповещения — сейчас инстанс один.
  let running = false;

  async function monitoringTick() {
    if (running) return;
    running = true;
    try {
      await runMonitoringTick();
    } catch (err) {
      // Тело тика завёрнуто целиком: реджект внутри setInterval никто не
      // ловит, а необработанный reject роняет процесс — то есть таймер
      // мониторинга уронил бы саму вику, которую он сторожит.
      console.error("[monitoring] тик проверок завершился ошибкой:", err);
    } finally {
      running = false;
    }
  }

  return setInterval(monitoringTick, MONITORING_INTERVAL_MS);
}

main().catch((err) => console.error("[instrumentation] не удалось запустить фоновые таймеры:", err));
