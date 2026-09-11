import { NextResponse } from "next/server";
import { attachmentHeader } from "@/lib/storage/contentDisposition";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

// Принудительное скачивание (R02) — прямая ссылка на объект в S3 не
// работает с атрибутом `download` у браузера: тот игнорируется для
// cross-origin ссылок (правило самого браузера, не наша ошибка), и файл
// вместо сохранения на диск открывался в новой вкладке. Сервер сам
// стримит объект с бакета и подставляет Content-Disposition: attachment —
// тогда браузеру всё равно, с какого домена на самом деле пришли байты.
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти." }, { status: 401 });
  }

  const { fileId } = await params;
  const file = await prisma.fileItem.findUnique({ where: { id: fileId } });
  if (!file) notFound();

  // Таймаут (тот же принцип, что и у S3Client в lib/storage/s3.ts) — без
  // него недостижимый бакет вешает этот роут на неопределённое время
  // вместо понятной ошибки клиенту.
  const upstream = await fetch(file.url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Не удалось получить файл из бакета." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": attachmentHeader(file.name),
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
    },
  });
}

