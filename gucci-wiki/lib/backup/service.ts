import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/settings/settings";
import { uploadBackupFile, listBackups, deleteObjects } from "@/lib/storage/s3";
import { createDatabaseDump, discardDump } from "@/lib/backup/dump";

export type BackupRunResult = { ok: true; key: string } | { ok: true; skipped: true } | { ok: false; error: string };

// Хранить последние 7 копий (решено с пользователем) — старше удаляются
// после каждого успешного бэкапа через deleteObject (уже существующая
// функция, best-effort — как и при удалении файлов вики).
const BACKUP_RETENTION_COUNT = 7;

// Оркестрация одного прогона автобэкапа — вызывается таймером
// (instrumentation.ts) раз в сутки. getSettings() читается заново на каждый
// вызов (не передаётся аргументом) — флаг backupEnabled не должен
// кэшироваться между тиками: включение/выключение в /settings обязано
// подхватываться со следующего тика без рестарта контейнера.
export async function runBackupIfEnabled(): Promise<BackupRunResult> {
  const settings = await getSettings();
  if (!settings.backupEnabled) {
    return { ok: true, skipped: true };
  }

  const dump = await createDatabaseDump();
  if (!dump.ok) {
    await recordResult(false, dump.error);
    return dump;
  }

  // finally, а не удаление после успешной загрузки: любой выход отсюда
  // (ошибка S3, исключение из recordResult) обязан убрать временный файл,
  // иначе tmpdir контейнера заполняется дампами по одному в сутки.
  let upload: Awaited<ReturnType<typeof uploadBackupFile>>;
  try {
    upload = await uploadBackupFile(dump.filePath, dump.fileName);
  } finally {
    await discardDump(dump.filePath);
  }

  if (!upload.ok) {
    await recordResult(false, upload.error);
    return upload;
  }

  await recordResult(true, null);

  // Ретеншн — вторичная задача: бэкап уже успешно создан и сохранён, ошибка
  // здесь не должна откатывать статус "ok" самого бэкапа, только логируется.
  await applyRetention().catch((err) => {
    console.error("[backup] не удалось применить ретеншн:", err);
  });

  return { ok: true, key: upload.key };
}

async function recordResult(ok: boolean, error: string | null) {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      backupLastAt: new Date(),
      backupLastStatus: ok ? "OK" : "ERROR",
      backupLastError: error,
    },
  });
}

async function applyRetention() {
  const result = await listBackups();
  if (!result.ok) {
    console.error("[backup] не удалось получить список бэкапов для ретеншна:", result.error);
    return;
  }

  const sorted = [...result.items].sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  const stale = sorted.slice(BACKUP_RETENTION_COUNT);
  if (stale.length === 0) return;

  const deleted = await deleteObjects(stale.map((item) => item.key));
  if (!deleted.ok) {
    console.error("[backup] не удалось удалить устаревшие бэкапы:", deleted.error);
    return;
  }
  for (const failure of deleted.failed) {
    console.error(`[backup] не удалось удалить устаревший бэкап ${failure.key}:`, failure.error);
  }
}
