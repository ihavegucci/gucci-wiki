import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export type S3TestConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
};

export type ConnectionTestResult = { ok: true } | { ok: false; error: string };

// Проверка соединения с бакетом: HeadBucket — не читает и не пишет
// объекты, только подтверждает, что бакет существует и ключи валидны.
export async function testS3Connection(config: S3TestConfig): Promise<ConnectionTestResult> {
  if (!config.bucket || !config.accessKey || !config.secretKey) {
    return { ok: false, error: "Заполните бакет, ключ доступа и секретный ключ." };
  }

  const client = new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region || "us-east-1",
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    // SDK default timeout is 0 (никогда) — недостижимый эндпоинт вешал бы
    // запрос на неопределённое время вместо понятной ошибки.
    requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout: 10_000 }),
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeS3Error(err) };
  } finally {
    client.destroy();
  }
}

function describeS3Error(err: unknown): string {
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  if (status === 403 || name === "Forbidden") return "Доступ запрещён — проверьте ключи.";
  if (status === 404 || name === "NotFound") return "Бакет не найден.";
  if (name === "TimeoutError" || name === "NetworkingError") return "Не удалось подключиться к эндпоинту.";

  return err instanceof Error ? err.message : "Не удалось подключиться к бакету.";
}
