import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/settings/settings";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { runChecks, type CheckLevel, type CheckResult } from "@/lib/monitoring/checks";

// Одно и то же состояние не должно приходить в Telegram каждый час: пишем
// при СМЕНЕ состояния (ok→проблема и проблема→ok) и, если проблема держится,
// не чаще раза в сутки как напоминание.
const REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Состояние живёт в памяти процесса намеренно: схема БД — не наша зона, а
// заводить ради этого таблицу несоразмерно. Плата — после рестарта первая же
// сохраняющаяся проблема будет отправлена повторно; это приемлемо (рестарт
// редкий, а лишнее напоминание о реальной проблеме безвредно).
const lastNotified = new Map<string, { level: CheckLevel; at: number }>();

export async function runMonitoringTick(): Promise<void> {
  const results = await runChecks();
  const now = Date.now();

  const due = results.filter((result) => {
    const previous = lastNotified.get(result.id);
    // Первое наблюдение: про «всё хорошо» не пишем вообще — стартовое
    // сообщение «всё в порядке» на каждый деплой было бы тем же спамом.
    if (!previous) return result.level !== "ok";
    if (previous.level !== result.level) return true;
    return result.level !== "ok" && now - previous.at >= REPEAT_INTERVAL_MS;
  });
  if (due.length === 0) return;

  const delivery = await notifyAdmins(formatMessage(due));
  // Состояние запоминаем, только если сообщение реально ушло. Иначе
  // временный сбой сети тихо съел бы единственное уведомление о проблеме:
  // состояние бы сдвинулось, а владелец так ничего и не узнал.
  //
  // «Некуда слать» (бот ещё не настроен) — тот же случай, а не успех:
  // если запомнить состояние сейчас, то после настройки бота владелец
  // узнает о держащейся проблеме только через сутки, по повтору.
  if (delivery !== "delivered") return;
  for (const result of due) lastNotified.set(result.id, { level: result.level, at: now });
}

function formatMessage(results: CheckResult[]): string {
  const lines = results.map((result) => `${prefix(result.level)} ${result.title}: ${result.message}`);
  return ["gucci-wiki — состояние сервера", "", ...lines].join("\n");
}

function prefix(level: CheckLevel): string {
  if (level === "alarm") return "[ТРЕВОГА]";
  if (level === "warn") return "[ВНИМАНИЕ]";
  return "[НОРМА]";
}

// Логируем «некуда слать» один раз за жизнь процесса: это настройка, а не
// сбой, и повторять её каждый час в логах бессмысленно.
let missingTargetLogged = false;

function logMissingTargetOnce(reason: string) {
  if (missingTargetLogged) return;
  missingTargetLogged = true;
  console.warn(`[monitoring] оповещения не отправляются: ${reason}. Дальнейшие такие сообщения не логируются.`);
}

async function notifyAdmins(text: string): Promise<"delivered" | "not-configured" | "failed"> {
  const settings = await getSettings();
  const token = settings.telegramBotToken;
  if (!token) {
    logMissingTargetOnce("Telegram-бот не настроен в /settings");
    return "not-configured";
  }

  // Только ADMIN: место на диске и срок сертификата — не то, что должно
  // прилетать всем сотрудникам, активировавшим бота (в отличие от рассылки
  // в lib/telegram/broadcast.ts, которая идёт всем осознанно).
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", telegramChatId: { not: null } },
    select: { telegramChatId: true },
  });
  if (admins.length === 0) {
    logMissingTargetOnce("ни один админ не активировал Telegram-бота");
    return "not-configured";
  }

  const sent = await Promise.all(admins.map((admin) => sendTelegramMessage(token, admin.telegramChatId as string, text)));
  // Достаточно одной удачной доставки: если у одного из админов бот
  // заблокирован, остальные оповещение получили, повторять не нужно.
  return sent.some(Boolean) ? "delivered" : "failed";
}
