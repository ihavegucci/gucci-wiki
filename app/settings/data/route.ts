import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings, updateSettings, toPublicSettings } from "@/lib/settings/settings";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const settings = await getSettings();
  return NextResponse.json(toPublicSettings(settings));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function PUT(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректные данные." }, { status: 400 });
  }

  const settings = await updateSettings({
    s3Endpoint: str(body.s3Endpoint),
    s3Bucket: str(body.s3Bucket),
    s3Region: str(body.s3Region),
    s3AccessKey: str(body.s3AccessKey),
    s3SecretKey: str(body.s3SecretKey),
    telegramBotToken: str(body.telegramBotToken),
    companyName: str(body.companyName),
  });

  return NextResponse.json(toPublicSettings(settings));
}
