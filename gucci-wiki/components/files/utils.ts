import {
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";

// Человекочитаемый размер — по образцу остального проекта (timeAgo в
// app/(app)/page.tsx), без сторонних библиотек.
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  return `${(kb / 1024).toFixed((kb / 1024) < 10 ? 1 : 0)} МБ`;
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// Принудительное скачивание одного файла (R02) — через собственный роут
// с Content-Disposition: attachment, а не прямая ссылка на S3 (та
// открывается в новой вкладке вместо сохранения, см. app/api/files/download/).
export function downloadUrl(fileId: string): string {
  return `/api/files/download/${fileId}`;
}

// «Скачать всё» (R04) — один ZIP-архив через /api/files/download-zip. Первая
// версия запускала последовательные скачивания каждого файла по отдельности —
// браузер разрешает только первое, инициированное настоящим пользовательским
// кликом, а остальные (из цикла/таймера) тихо блокирует как множественные
// автоматические загрузки — нашёл пользователь, скачивался только один файл.
export function downloadAllUrl(fileIds: string[], name: string): string {
  const params = new URLSearchParams();
  for (const id of fileIds) params.append("id", id);
  params.set("name", name);
  return `/api/files/download-zip?${params.toString()}`;
}

export function downloadAll(fileIds: string[], name: string): void {
  const a = document.createElement("a");
  a.href = downloadAllUrl(fileIds, name);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Иконка по типу файла (A03 в plan.md) — тот же список, что уже даёт
// lucide-react, без новой библиотеки.
export function getFileIcon(mimeType: string): LucideIcon {
  if (mimeType === "application/pdf" || mimeType.includes("word")) return FileText;
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z") || mimeType.includes("compressed"))
    return FileArchive;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel"))
    return FileSpreadsheet;
  return FileIcon;
}
