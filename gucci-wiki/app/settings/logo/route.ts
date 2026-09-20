import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings, updateSettings, toPublicSettings } from "@/lib/settings/settings";
import { validateLogoPng, MAX_LOGO_SIZE } from "@/lib/settings/logo";
import { uploadFile, deleteObject } from "@/lib/storage/s3";

// Загрузка логотипа (R15/R16) — только Admin, как весь /settings.
// Старый объект в бакете чистится best-effort при замене (см. D01 в
// plan.md): ошибка удаления не должна мешать сохранению нового логотипа.
export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  // Отсечка по Content-Length до чтения тела: `validateLogoPng` проверяет
  // размер, но только после того, как файл уже целиком в памяти — то есть
  // 200-мегабайтный «логотип» отклонялся бы, успев занять память контейнера.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_LOGO_SIZE + 1024 * 1024) {
    return NextResponse.json({ error: "Логотип слишком большой (максимум 2 МБ)." }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Файл не передан." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: "Логотип слишком большой (максимум 2 МБ)." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateLogoPng(bytes, file.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = await uploadFile(file, bytes, "image/png");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const previous = await getSettings();
  const settings = await updateSettings({ logoUrl: result.url, logoKey: result.key });

  if (previous.logoKey) {
    deleteObject(previous.logoKey).catch(() => {});
  }

  return NextResponse.json(toPublicSettings(settings));
}

// Удаление логотипа без замены.
export async function DELETE() {
  const { response } = await requireAdmin();
  if (response) return response;

  const previous = await getSettings();
  const settings = await updateSettings({ logoUrl: "", logoKey: "" });

  if (previous.logoKey) {
    deleteObject(previous.logoKey).catch(() => {});
  }

  return NextResponse.json(toPublicSettings(settings));
}
