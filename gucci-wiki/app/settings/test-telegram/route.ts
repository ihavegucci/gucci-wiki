import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings } from "@/lib/settings/settings";
import { testTelegramBot } from "@/lib/settings/telegram";

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const saved = await getSettings();
  const token = typeof body.telegramBotToken === "string" && body.telegramBotToken
    ? body.telegramBotToken
    : saved.telegramBotToken ?? "";

  const result = await testTelegramBot(token);
  return NextResponse.json(result);
}
