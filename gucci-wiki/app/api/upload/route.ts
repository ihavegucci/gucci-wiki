import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { uploadFile } from "@/lib/storage/s3";
import { sniffImageType } from "@/lib/storage/sniff";
import { canEdit } from "@/lib/permissions";
import { MAX_UPLOAD_SIZE, formatMaxSize, exceedsContentLength } from "@/lib/storage/limits";
import { getOrCreateUnsortedFolder } from "@/lib/files/actions";

// Загрузка — только для картинок в статью. `file.type` из FormData — это
// Content-Type части multipart-запроса, который отправитель ставит сам
// (кнопка в тулбаре шлёт accept="image/*", но это чисто клиентская
// подсказка, не проверка) — доверять ему нельзя. Реальный тип определяется
// по сигнатуре байт (lib/storage/sniff.ts): без этого сюда можно было
// залить произвольный файл (HTML/SVG со скриптом и т.д.) под видом
// картинки — подтверждено слепой проверкой (G3) живым запросом.
// SVG сознательно не входит в список — это XML и может нести <script>.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Загрузка файлов из редактора статьи (кусок 2) в S3-бакет, настроенный
// в /settings (кусок 5).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!canEdit(user)) {
    return NextResponse.json({ error: "Недостаточно прав для этого действия." }, { status: 403 });
  }

  // До `formData()` — см. комментарий у `exceedsContentLength`.
  if (exceedsContentLength(request)) {
    return NextResponse.json({ error: `Файл слишком большой (максимум ${formatMaxSize()}).` }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Файл не передан." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: `Файл слишком большой (максимум ${formatMaxSize()}).` }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffImageType(bytes);
  if (!realType || !ALLOWED_TYPES.has(realType)) {
    return NextResponse.json({ error: "Разрешены только изображения (PNG, JPEG, GIF, WebP)." }, { status: 400 });
  }

  const result = await uploadFile(file, bytes, realType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Прямая загрузка из статьи (кусок 6, R09) тоже должна появиться в
  // «Файлы» — иначе она нигде не видна кроме самой статьи. Складываем в
  // системную папку «Нераспределённое», как и остальные бесхозные загрузки.
  const folderId = await getOrCreateUnsortedFolder();
  await prisma.fileItem.create({
    data: {
      folderId,
      name: file.name,
      key: result.key,
      url: result.url,
      mimeType: realType,
      size: file.size,
      uploaderId: user.id,
    },
  });
  revalidatePath("/files");

  return NextResponse.json({ url: result.url });
}
