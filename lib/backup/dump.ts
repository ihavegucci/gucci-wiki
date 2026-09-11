import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type DumpResult =
  | { ok: true; filePath: string; fileName: string }
  | { ok: false; error: string };

// Таймаут на сам процесс дампа (тот же принцип, что connectionTimeout/
// requestTimeout у S3Client в lib/storage/s3.ts) — без него зависший
// pg_dump (например Postgres недоступен на середине) вешает тик таймера
// в instrumentation.ts навсегда вместо понятной ошибки в лог.
const DUMP_TIMEOUT_MS = 5 * 60 * 1000;

// pg_dump в custom-формате (-Fc): сжат сам по себе (не нужен отдельный
// gzip), восстанавливается pg_restore, поддерживает выборочное
// восстановление и параллельность — предпочтительнее plain SQL для
// регулярного автобэкапа с целью disaster recovery.
//
// Дамп пишется во временный файл, а не копится в памяти (QA-прогон 4).
// Раньше stdout собирался массивом буферов и склеивался Buffer.concat —
// в пике это две копии дампа в куче, при mem_limit контейнера 350 МБ база
// на ~150 МБ убивала процесс ровно в момент ночного бэкапа. Файл заливается
// в S3 потоком (uploadBackupFile), так что пик по памяти больше не зависит
// от размера базы.
//
// Уборка файла — на вызывающем (discardDump в finally, см. service.ts):
// удалить его здесь нельзя, он ещё не залит. Все пути неуспеха убирают файл
// сами, чтобы недописанный дамп не оставался в tmpdir навсегда.
//
// Креды — не новая конфигурация, а разбор уже существующего DATABASE_URL
// (того же, что использует Prisma): гарантированно тот же хост/порт/юзер/
// пароль/база, без риска рассинхронизации с реальным подключением. Передаём
// pg_dump через переменные окружения процесса (PGHOST/PGPASSWORD/...), не
// аргументами командной строки — иначе пароль виден в списке процессов (ps aux).
export async function createDatabaseDump(): Promise<DumpResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL не задан." };
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL некорректен." };
  }

  const fileName = `backup-${new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "")}.dump`;
  // Имя на диске — uuid, не fileName: имя бэкапа содержит только время с
  // точностью до секунды, и два прогона в одну секунду перетёрли бы файл
  // друг друга.
  const filePath = join(tmpdir(), `gucci-dump-${randomUUID()}`);

  const result = await new Promise<DumpResult>((resolve) => {
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let dumpClosed = false;
    let fileClosed = false;
    let exitError: string | null = null;

    const out = createWriteStream(filePath);

    const finish = (value: DumpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    // Резолвим только когда И процесс завершился, И файл дописан на диск:
    // иначе fs.stat в uploadBackupFile может увидеть неполный размер.
    const maybeFinish = () => {
      if (!dumpClosed || !fileClosed) return;
      finish(exitError ? { ok: false, error: exitError } : { ok: true, filePath, fileName });
    };

    const child = spawn("pg_dump", ["-Fc"], {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: url.username,
        PGPASSWORD: url.password,
        PGDATABASE: url.pathname.slice(1),
      },
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      out.destroy();
      finish({ ok: false, error: "pg_dump не завершился за отведённое время." });
    }, DUMP_TIMEOUT_MS);

    child.stdout.pipe(out);
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    out.on("error", (err) => {
      child.kill("SIGKILL");
      finish({ ok: false, error: `Не удалось записать дамп на диск: ${err.message}` });
    });
    out.on("close", () => {
      fileClosed = true;
      maybeFinish();
    });

    child.on("error", (err) => {
      out.destroy();
      finish({ ok: false, error: `Не удалось запустить pg_dump: ${err.message}` });
    });

    child.on("close", (code) => {
      dumpClosed = true;
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
        exitError = `pg_dump завершился с ошибкой (код ${code}): ${stderr || "нет вывода"}`;
      }
      maybeFinish();
    });
  });

  if (!result.ok) {
    await discardDump(filePath);
  }
  return result;
}

// Уборка временного файла — всегда best-effort: файла может не быть вовсе
// (pg_dump не запустился), и это не повод ронять уже успешный бэкап.
export async function discardDump(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch((err) => {
    console.error(`[backup] не удалось удалить временный файл дампа ${filePath}:`, err);
  });
}
