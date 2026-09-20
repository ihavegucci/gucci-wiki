import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { uploadFile } from "@/lib/storage/s3";
import { canEdit } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { MAX_UPLOAD_SIZE, formatMaxSize, exceedsContentLength } from "@/lib/storage/limits";

// Загрузка в раздел «Файлы» (кусок 3, R10) — в отличие от app/api/upload/route.ts
// (только картинки для статей), сюда принимается любой тип файла: единого
// списка сигнатур «любых» файлов не существует, поэтому тип берём из
// заголовка запроса (file.type) — он используется только как метаданные
// (mimeType в БД), не как проверка допустимости содержимого.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!canEdit(user)) {
    return NextResponse.json({ error: "Недостаточно прав для этого действия." }, { status: 403 });
  }

  // До `formData()`: иначе байты уже в памяти и проверять поздно — см.
  // комментарий у `exceedsContentLength`.
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

  const folderId = String(formData?.get("folderId") ?? "") || null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const result = await uploadFile(file, bytes, mimeType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const item = await prisma.fileItem.create({
    data: {
      folderId,
      name: file.name,
      key: result.key,
      url: result.url,
      mimeType,
      size: file.size,
      uploaderId: user.id,
    },
  });

  revalidatePath("/files");
  return NextResponse.json({ id: item.id, url: item.url, name: item.name });
}
