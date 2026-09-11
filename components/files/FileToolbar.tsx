"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Upload } from "lucide-react";
import { createFolderAction } from "@/lib/files/actions";
import { xhrUpload, UploadAbortedError } from "@/lib/upload/xhrUpload";
import UploadProgress, { type UploadState } from "@/components/ui/UploadProgress";

// Кнопки «Новая папка»/«Загрузить» — видны только canEdit (R07), сама
// проверка сделана страницей (эти кнопки вообще не рендерятся Viewer'у).
export default function FileToolbar({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Отмена нужна в двух видах: оборвать текущий запрос (abortRef) и не
  // начинать следующие файлы очереди (cancelledRef) — одного abort мало,
  // цикл просто перешёл бы к следующему файлу.
  const abortRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  // Раньше ошибка загрузки (S3 не настроен, сеть недоступна и т.д.) тихо
  // проглатывалась `.catch(() => null)` — пользователь видел, что "ничего
  // не происходит", без единого сообщения о причине. Теперь ответ каждой
  // загрузки проверяется, и первая ошибка показывается под кнопкой.
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setError(null);
    cancelledRef.current = false;
    let firstError: string | null = null;

    for (const [index, file] of files.entries()) {
      if (cancelledRef.current) break;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folderId", folderId ?? "");

      setProgress({
        name: file.name,
        loaded: 0,
        total: file.size,
        note: files.length > 1 ? `${index + 1} из ${files.length}` : undefined,
      });

      const upload = xhrUpload("/api/files/upload", fd, (p) =>
        setProgress((prev) => prev && { ...prev, loaded: p.loaded, total: p.total })
      );
      abortRef.current = upload.abort;
      try {
        await upload.promise;
      } catch (e) {
        if (e instanceof UploadAbortedError) break;
        firstError ??= e instanceof Error ? e.message : `Не удалось загрузить «${file.name}».`;
      } finally {
        abortRef.current = null;
      }
    }

    setUploading(false);
    setProgress(null);
    setError(firstError);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function cancelUpload() {
    cancelledRef.current = true;
    abortRef.current?.();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
    <div className="flex flex-wrap items-center justify-end gap-2">
      {creating ? (
        <form
          action={createFolderAction}
          onSubmit={() => {
            setCreating(false);
            setName("");
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="parentId" value={folderId ?? ""} />
          <input
            name="name"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название папки"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <button type="submit" className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700">
            Создать
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            Отмена
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <FolderPlus size={16} />
          Новая папка
        </button>
      )}

      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700">
        <Upload size={16} />
        {uploading ? "Загрузка…" : "Загрузить"}
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </label>
    </div>
    {progress && <UploadProgress state={progress} onCancel={cancelUpload} />}
    {error && <span className="max-w-xs text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
