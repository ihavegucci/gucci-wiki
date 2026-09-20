"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { broadcastTelegramMessage } from "@/lib/telegram/broadcast";

export type BroadcastState =
  | { ok: true; sent: number; failed: number }
  | { ok: false; error: string }
  | null;

// Рассылка от админа (R04/G09) — произвольный текст всем, кто активировал
// бота. Права — та же временная схема, что и в lib/pages/actions.ts /
// lib/spaces/actions.ts (кусок 8 заменит на lib/permissions/ везде разом).
export async function sendBroadcastAction(_prev: BroadcastState, formData: FormData): Promise<BroadcastState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return { ok: false, error: "Доступ запрещён." };
  }

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "Введите текст сообщения." };

  const result = await broadcastTelegramMessage(text);
  if (result.skipped === "no-token") {
    return { ok: false, error: "Сначала подключите токен бота в настройках." };
  }

  return { ok: true, sent: result.sent, failed: result.failed };
}
