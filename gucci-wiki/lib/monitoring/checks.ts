import { statfs } from "node:fs/promises";
import { checkServerIdentity, connect, type PeerCertificate } from "node:tls";
import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/settings/settings";

// Мониторинг из «критично» отчёта по отказоустойчивости. Сознательно НЕ
// включает проверку «сайт упал»: изнутри собственного процесса её сделать
// нельзя — умер процесс, умер и таймер, который должен был об этом сообщить.
// Для этого нужен внешний наблюдатель (uptime-сервис или пинг с другой
// машины), и это согласовано с владельцем как отдельная, не кодовая задача.
export type CheckLevel = "ok" | "warn" | "alarm";
export type CheckResult = { id: string; title: string; level: CheckLevel; message: string };

const DISK_WARN_RATIO = 0.15;
const DISK_ALARM_RATIO = 0.05;
const TLS_WARN_DAYS = 14;
const TLS_ALARM_DAYS = 3;
const TLS_CONNECT_TIMEOUT_MS = 10_000;
const DB_QUERY_TIMEOUT_MS = 5_000;
const BACKUP_STALE_MS = 2 * 24 * 60 * 60 * 1000;
// Бэкап-таймер проставляет backupLastAt при первом же захвате слота, то есть
// в течение часа после включения чекбокса. Пустое значение считаем поводом
// для тревоги только после этого запаса — иначе первый же тик мониторинга
// после включения бэкапа кричал бы о проблеме, которой ещё не случилось.
const BACKUP_FIRST_RUN_GRACE_MS = 2 * 60 * 60 * 1000;

export async function runChecks(): Promise<CheckResult[]> {
  // Каждая проверка изолирована: недоступная сеть в проверке TLS не должна
  // забирать с собой отчёт о заканчивающемся диске.
  const results = await Promise.all([settle(checkDisk), settle(checkTls), settle(checkDatabase), settle(checkBackup)]);
  return results.filter((r): r is CheckResult => r !== null);
}

async function settle(check: () => Promise<CheckResult | null>): Promise<CheckResult | null> {
  try {
    return await check();
  } catch (err) {
    console.error("[monitoring] проверка завершилась ошибкой:", err);
    return null;
  }
}

// Свободное место меряем по каталогу приложения, а не по пути тома Postgres:
// изнутри контейнера тома не видно, зато overlayfs приложения лежит на том же
// физическом диске хоста, что и docker-том с БД — цифра получается та, ради
// которой проверка и заводилась.
async function checkDisk(): Promise<CheckResult | null> {
  const stats = await statfs(process.cwd());
  const total = Number(stats.blocks) * Number(stats.bsize);
  if (total <= 0) return null;

  // bavail, не bfree: часть свободных блоков зарезервирована под root и
  // обычному процессу недоступна — по bfree диск выглядел бы просторнее,
  // чем он есть для самого приложения.
  const free = Number(stats.bavail) * Number(stats.bsize);
  const ratio = free / total;
  const message = `свободно ${(ratio * 100).toFixed(1)}% (${toGb(free)} ГБ из ${toGb(total)} ГБ)`;

  if (ratio < DISK_ALARM_RATIO) return { id: "disk", title: "Место на диске", level: "alarm", message };
  if (ratio < DISK_WARN_RATIO) return { id: "disk", title: "Место на диске", level: "warn", message };
  return { id: "disk", title: "Место на диске", level: "ok", message };
}

async function checkTls(): Promise<CheckResult | null> {
  const origin = process.env.APP_ORIGIN ?? "";
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  // http — локальная разработка или прокси без TLS: проверять нечего,
  // молча пропускаем, а не сообщаем о «проблеме с сертификатом».
  if (url.protocol !== "https:") return null;

  const port = url.port ? Number(url.port) : 443;
  let cert: PeerCertificate;
  try {
    cert = await fetchPeerCertificate(url.hostname, port);
  } catch (err) {
    // Сетевой сбой изнутри процесса неотличим от «сайт лежит», а это как раз
    // тот вывод, который отсюда делать нельзя (см. комментарий вверху файла).
    // Пишем в лог и не поднимаем тревогу.
    console.error("[monitoring] не удалось получить TLS-сертификат:", err);
    return null;
  }

  const identityError = checkServerIdentity(url.hostname, cert);
  if (identityError) {
    return {
      id: "tls",
      title: "TLS-сертификат",
      level: "alarm",
      message: `сертификат домена ${url.hostname} не соответствует домену: ${identityError.message}`,
    };
  }

  const validTo = new Date(cert.valid_to);
  if (Number.isNaN(validTo.getTime())) return null;

  const days = Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const message = `домен ${url.hostname}, осталось ${days} дн. (до ${validTo.toISOString().slice(0, 10)})`;
  if (days <= TLS_ALARM_DAYS) return { id: "tls", title: "TLS-сертификат", level: "alarm", message };
  if (days <= TLS_WARN_DAYS) return { id: "tls", title: "TLS-сертификат", level: "warn", message };
  return { id: "tls", title: "TLS-сертификат", level: "ok", message };
}

// rejectUnauthorized: false намеренно — соединение здесь не используется для
// передачи данных, нужен только сам сертификат. При строгой проверке
// просроченный сертификат (ровно то, о чём надо предупредить) обрывал бы
// рукопожатие, и до valid_to мы бы не добрались; подлинность домена
// проверяется отдельно через checkServerIdentity выше.
function fetchPeerCertificate(host: string, port: number): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (!cert || !cert.valid_to) reject(new Error("сервер не прислал сертификат"));
      else resolve(cert);
    });
    socket.setTimeout(TLS_CONNECT_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error(`таймаут подключения к ${host}:${port}`));
    });
    socket.once("error", (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

async function checkDatabase(): Promise<CheckResult | null> {
  const timeout = new Promise<never>((_, reject) => {
    // unref — таймер не должен держать процесс живым, если всё остальное
    // уже завершилось.
    setTimeout(() => reject(new Error("нет ответа за 5 с")), DB_QUERY_TIMEOUT_MS).unref();
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return { id: "db", title: "База данных", level: "ok", message: "отвечает" };
  } catch (err) {
    return {
      id: "db",
      title: "База данных",
      level: "alarm",
      message: `не отвечает: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkBackup(): Promise<CheckResult | null> {
  const settings = await getSettings();
  // Выключенный автобэкап — осознанный выбор владельца, а не поломка.
  if (!settings.backupEnabled) return null;

  const title = "Автобэкап БД";
  if (settings.backupLastStatus === "ERROR") {
    return { id: "backup", title, level: "alarm", message: `последний прогон с ошибкой: ${settings.backupLastError ?? "без описания"}` };
  }

  if (!settings.backupLastAt) {
    if (process.uptime() * 1000 < BACKUP_FIRST_RUN_GRACE_MS) return null;
    return { id: "backup", title, level: "alarm", message: "включён, но ни одного прогона так и не было" };
  }

  const age = Date.now() - settings.backupLastAt.getTime();
  const message = `последний прогон ${settings.backupLastAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  if (age > BACKUP_STALE_MS) return { id: "backup", title, level: "alarm", message: `${message} — старше двух суток` };
  return { id: "backup", title, level: "ok", message };
}

function toGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}
