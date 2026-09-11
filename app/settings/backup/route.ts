import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings, updateSettings, toPublicSettings } from "@/lib/settings/settings";
import { listBackups } from "@/lib/storage/s3";

// Секция «Резервное копирование» в /settings — статус последнего прогона
// (из Settings) + список файлов в бакете (из S3, не из БД — источник
// истины сам бакет, в БД хранится только последний результат).
async function buildResponse() {
  const settings = await getSettings();
  const backups = await listBackups();

  return {
    ...toPublicSettings(settings).backup,
    items: backups.ok ? backups.items : [],
    itemsError: backups.ok ? null : backups.error,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  return NextResponse.json(await buildResponse());
}

export async function PUT(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.backupEnabled !== "boolean") {
    return NextResponse.json({ error: "Некорректные данные." }, { status: 400 });
  }

  await updateSettings({ backupEnabled: body.backupEnabled });
  return NextResponse.json(await buildResponse());
}
