import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { downloadBackupStream } from "@/lib/storage/s3";
import { attachmentHeader } from "@/lib/storage/contentDisposition";

// Принудительное скачивание файла бэкапа — тот же приём, что
// app/api/files/download/[fileId]/route.ts (Content-Disposition: attachment,
// не прямая ссылка на бакет), но через GetObjectCommand (lib/storage/s3.ts),
// а не fetch по публичному URL: бэкап БД не обязан быть публично читаемым
// объектом.
export async function GET(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const key = new URL(request.url).searchParams.get("key") ?? "";

  // Ключ приходит от клиента — обязательная проверка префикса и отсутствия
  // "..", иначе это произвольное чтение бакета по ключу, присланному извне.
  if (!key.startsWith("backups/") || key.includes("..")) {
    return NextResponse.json({ error: "Некорректный ключ." }, { status: 400 });
  }

  const result = await downloadBackupStream(key);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const fileName = key.slice("backups/".length);

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      // Раньше имя вставлялось в заголовок как есть: проверка выше ловит
      // префикс и "..", но не кавычки и не управляющие символы — ключ вида
      // `backups/x%0AX-Injected:%201` проходил её и превращался в инъекцию
      // заголовка (на строгом стеке — в 500 при сборке Headers).
      "Content-Disposition": attachmentHeader(fileName),
      ...(result.contentLength !== undefined ? { "Content-Length": String(result.contentLength) } : {}),
    },
  });
}
