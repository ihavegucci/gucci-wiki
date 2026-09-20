import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { getSettings } from "@/lib/settings/settings";

// SDK по умолчанию не ограничивает время запроса (см. тот же комментарий в
// lib/settings/s3.ts) — недостижимый/неверно указанный эндпоинт вешал бы
// загрузку/удаление на неопределённое время вместо понятной ошибки. Нашёл
// пользователь: после настройки реального бакета загрузка просто "висела".
const REQUEST_HANDLER = new NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout: 15_000 });

export type UploadResult = { ok: true; url: string; key: string } | { ok: false; error: string };
export type DeleteResult = { ok: true } | { ok: false; error: string };

// Единственное место в проекте, собирающее S3Client (было продублировано
// трижды — в uploadFile, deleteObject и здесь для новых операций бэкапа —
// сведено в один хелпер). forcePathStyle — для самостоятельно захостенных
// S3-совместимых бакетов (MinIO и т.п.), а не только для настоящего AWS S3.
type ConfiguredClient = { client: S3Client; bucket: string; endpoint: string; region: string };

// Клиент кэшируется на процесс и переиспользуется между вызовами (QA-прогон 4).
// Раньше каждый вызов собирал новый S3Client со своим пулом сокетов и тут же
// его уничтожал — при удалении папки с 300 файлами это 300 клиентов и 300
// новых TLS-рукопожатий подряд. Ключ кэша — сами значения настроек: смена
// бакета/ключей в /settings пересоздаёт клиент со следующего вызова, без
// рестарта контейнера. Инвалидация по значениям, а не по времени, —
// единственный способ не показать пользователю «сохранил, а работает старое».
let cached: { key: string; client: S3Client } | null = null;

async function getConfiguredClient(): Promise<{ ok: true } & ConfiguredClient | { ok: false; error: string }> {
  const settings = await getSettings();
  const endpoint = settings.s3Endpoint || "";
  const bucket = settings.s3Bucket || "";
  const region = settings.s3Region || "";
  const accessKey = settings.s3AccessKey || "";
  const secretKey = settings.s3SecretKey || "";

  if (!bucket || !accessKey || !secretKey) {
    return { ok: false, error: "S3-бакет не настроен. Заполните бакет и ключи в /settings." };
  }

  // JSON.stringify, а не склейка через разделитель: экранирование кавычек
  // гарантирует, что два разных набора значений не дадут один и тот же ключ.
  const cacheKey = JSON.stringify([endpoint, bucket, region, accessKey, secretKey]);

  if (!cached || cached.key !== cacheKey) {
    // Старый клиент закрываем сразу: его сокеты уже никому не нужны, а без
    // destroy() они висят в keep-alive до таймаута.
    cached?.client.destroy();
    cached = {
      key: cacheKey,
      client: new S3Client({
        endpoint: endpoint || undefined,
        region: region || "us-east-1",
        forcePathStyle: Boolean(endpoint),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        // Таймауты обязаны быть в любом пути создания клиента — жёсткое
        // правило проекта (см. комментарий у REQUEST_HANDLER выше).
        requestHandler: REQUEST_HANDLER,
        // По умолчанию SDK добавляет CRC32 к каждому PutObject, а для тела-
        // потока (uploadBackupFile) это означает передачу в кодировке
        // aws-chunked с трейлером. Настоящий AWS её понимает, а произвольное
        // S3-совместимое хранилище пользователя — не обязано. WHEN_REQUIRED
        // оставляет обычное тело с Content-Length, которое принимают все.
        requestChecksumCalculation: "WHEN_REQUIRED",
      }),
    };
  }

  return { ok: true, client: cached.client, bucket, endpoint, region };
}

// `bytes`/`verifiedType` — уже прочитанное содержимое и тип, определённый
// по сигнатуре байт вызывающей стороной (app/api/upload/route.ts), а не
// `file.type` (заголовок, который отправитель полностью контролирует сам).
export async function uploadFile(file: File, bytes: Uint8Array, verifiedType: string): Promise<UploadResult> {
  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket, endpoint, region } = configured;

  const key = `uploads/${randomUUID()}-${sanitizeFilename(file.name)}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: verifiedType,
      })
    );
    return { ok: true, url: buildPublicUrl(endpoint, bucket, region, key), key };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

// Удаление объекта из бакета (кусок 3) — вызывается best-effort при
// удалении FileItem/папки (D01 в plan.md) и ретеншном старых бэкапов
// (lib/backup/service.ts): ошибка здесь не должна мешать вызывающей стороне.
export async function deleteObject(key: string): Promise<DeleteResult> {
  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket } = configured;

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

// Пакетное удаление (QA-прогон 4): удаление папки с сотнями файлов делало
// столько же отдельных HTTP-запросов. DeleteObjects берёт до 1000 ключей за
// раз — это ограничение протокола S3, отсюда размер чанка.
const DELETE_BATCH_SIZE = 1000;

export type DeleteManyResult =
  | { ok: true; failed: { key: string; error: string }[] }
  | { ok: false; error: string };

export async function deleteObjects(keys: string[]): Promise<DeleteManyResult> {
  if (keys.length === 0) return { ok: true, failed: [] };

  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket } = configured;

  const failed: { key: string; error: string }[] = [];

  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const chunk = keys.slice(i, i + DELETE_BATCH_SIZE);
    try {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          // Quiet: ответ содержит только ошибки, без перечисления всех
          // успешно удалённых ключей — на 1000 объектов это заметно меньший
          // XML, а список успехов вызывающей стороне и не нужен.
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      );
      for (const err of result.Errors ?? []) {
        failed.push({ key: err.Key ?? "", error: err.Message ?? err.Code ?? "неизвестная ошибка" });
      }
    } catch (err) {
      // DeleteObjects — не самая обязательная часть протокола: отдельные
      // S3-совместимые хранилища её не реализуют, и тогда весь чанк падает
      // целиком, осиротив сотни объектов молча. Откатываемся на поштучное
      // удаление, которое поддерживают все.
      const batchError = describeUploadError(err);
      console.error("[s3] пакетное удаление не удалось, переходим на поштучное:", batchError);
      for (const key of chunk) {
        const single = await deleteObject(key);
        if (!single.ok) failed.push({ key, error: single.error });
      }
    }
  }

  return { ok: true, failed };
}

// Дамп БД (lib/backup/dump.ts) — ключ строится из уже уникального имени
// файла (таймстамп), не uuid, чтобы список в /settings и в самом бакете
// был человекочитаемым и естественно сортировался по дате.
//
// Принимает путь к файлу, а не Buffer (QA-прогон 4): дамп заливается
// потоком с диска, иначе база на 150 МБ означала бы 150 МБ в куче процесса
// при mem_limit контейнера 350 МБ. ContentLength обязателен — по потоку S3
// сам длину не узнает, а без неё SDK либо буферизует тело целиком (то, от
// чего и уходим), либо падает. Побочный эффект потока: SDK не может
// повторить запрос при сетевом сбое (поток уже частично прочитан) —
// приемлемо, следующий тик таймера сделает бэкап заново.
export async function uploadBackupFile(filePath: string, fileName: string): Promise<UploadResult> {
  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket, endpoint, region } = configured;

  const key = `backups/${fileName}`;

  try {
    const { size } = await stat(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: "application/octet-stream",
      })
    );
    return { ok: true, url: buildPublicUrl(endpoint, bucket, region, key), key };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

export type BackupObjectInfo = { key: string; fileName: string; size: number; lastModified: Date };

// Список бэкапов под префиксом backups/ — переиспользуется и ретеншном
// (lib/backup/service.ts), и списком для скачивания в /settings. Без
// пагинации: при работающем ретеншне (7 объектов) один запрос достаточен.
export async function listBackups(): Promise<{ ok: true; items: BackupObjectInfo[] } | { ok: false; error: string }> {
  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket } = configured;

  try {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" }));
    const items = (result.Contents ?? [])
      .filter((obj) => obj.Key && obj.Size !== undefined && obj.LastModified)
      .map((obj) => ({
        key: obj.Key!,
        fileName: obj.Key!.slice("backups/".length),
        size: obj.Size!,
        lastModified: obj.LastModified!,
      }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

// Стрим объекта по ключу — GetObjectCommand, не голый fetch по публичному
// URL (в отличие от файлов вики через FileItem.url): бэкап БД не обязан
// быть публично читаемым объектом бакета. Вызывающий роут
// (app/settings/backup/download/route.ts) обязан сам проверить, что key
// принадлежит префиксу backups/ и не содержит "..", прежде чем звать это —
// иначе это произвольное чтение бакета по ключу, присланному клиентом.
export async function downloadBackupStream(
  key: string
): Promise<{ ok: true; body: ReadableStream; contentLength?: number } | { ok: false; error: string }> {
  const configured = await getConfiguredClient();
  if (!configured.ok) return configured;
  const { client, bucket } = configured;

  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) {
      return { ok: false, error: "Пустой ответ от бакета." };
    }
    // Клиент больше не уничтожается по завершении чтения: он общий на весь
    // процесс (см. кэш в getConfiguredClient) — destroy() здесь оборвал бы
    // сокеты чужих одновременных операций. Отменяем только сам reader, чтобы
    // при обрыве скачивания не течь незакрытым ответом.
    const reader = result.Body.transformToWebStream().getReader();
    const body = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        void reader.cancel(reason);
      },
    });
    return { ok: true, body, contentLength: result.ContentLength };
  } catch (err) {
    return { ok: false, error: describeUploadError(err) };
  }
}

function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return safe || "file";
}

// Кастомный эндпоинт (self-hosted S3-совместимое хранилище) → path-style
// ссылка на объект. Настоящий AWS S3 (эндпоинт не задан) → виртуальный
// хост бакета, стандартный публичный URL объекта.
function buildPublicUrl(endpoint: string, bucket: string, region: string, key: string): string {
  if (endpoint) {
    return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region || "us-east-1"}.amazonaws.com/${key}`;
}

function describeUploadError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  if (status === 403 || name === "Forbidden" || name === "AccessDenied") {
    return "Доступ запрещён — проверьте ключи S3 в настройках.";
  }
  if (status === 404 || name === "NoSuchBucket" || name === "NotFound") {
    return "Бакет не найден — проверьте настройки S3.";
  }
  if (name === "TimeoutError" || name === "NetworkingError") {
    return "Не удалось подключиться к S3-эндпоинту.";
  }

  return err instanceof Error ? err.message : "Не удалось загрузить файл в бакет.";
}
