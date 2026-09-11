import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings } from "@/lib/settings/settings";
import { testS3Connection } from "@/lib/settings/s3";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Проверяет соединение с тем, что сейчас в форме — незаполненные секретные
// поля (accessKey/secretKey) достраиваются уже сохранённым значением из БД,
// чтобы можно было проверить сохранённый конфиг, не перепечатывая ключи.
export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const saved = await getSettings();

  const result = await testS3Connection({
    endpoint: str(body.s3Endpoint) || saved.s3Endpoint || "",
    bucket: str(body.s3Bucket) || saved.s3Bucket || "",
    region: str(body.s3Region) || saved.s3Region || "",
    accessKey: str(body.s3AccessKey) || saved.s3AccessKey || "",
    secretKey: str(body.s3SecretKey) || saved.s3SecretKey || "",
  });

  return NextResponse.json(result);
}
