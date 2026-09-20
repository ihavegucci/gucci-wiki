"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Download, Trash2, Layers, DownloadCloud } from "lucide-react";
import { deleteFileAction } from "@/lib/files/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useFocusTrap } from "@/components/useFocusTrap";
import { formatSize, isImage, getFileIcon, downloadUrl, downloadAll } from "./utils";
import AddToCollectionModal from "./AddToCollectionModal";

type FileRow = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
};
type CollectionOption = { id: string; title: string };

// Сетка файлов (без папок — те теперь в components/files/FolderGrid.tsx,
// правка пользователя: папки и коллекции отдельными секциями). Выбор
// (чекбоксы) и лайтбокс картинок — единственное клиентское состояние,
// сами данные приходят с сервера как пропсы.
export default function FileGrid({
  files,
  canEdit,
  collections,
  zipName = "Файлы",
}: {
  files: FileRow[];
  canEdit: boolean;
  collections: CollectionOption[];
  zipName?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<FileRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(0);
  const [deleting, startDeleting] = useTransition();
  // Лайтбокс живёт прямо в этом компоненте, а не отдельной модалкой —
  // поэтому ловушка включается по наличию открытой картинки.
  const lightboxRef = useFocusTrap<HTMLDivElement>(lightbox !== null);

  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Массовое удаление выбранных файлов — правка пользователя (кнопка
  // «Удалить» рядом с «Добавить в коллекцию»). Переиспользует тот же
  // deleteFileAction, что и удаление одного файла — по одному вызову на id,
  // без отдельного bulk-action на сервере ради пары строк здесь.
  //
  // Ошибка на любом файле раньше обрывала цикл: остальные не удалялись,
  // выделение не снималось и router.refresh() не звался — интерфейс
  // застревал на «Удаление…». Теперь неудачи считаются, цикл идёт до конца,
  // а число неудалённых показывается рядом с кнопкой.
  function deleteSelected() {
    setConfirmingDelete(false);
    setDeleteFailed(0);
    startDeleting(async () => {
      let failed = 0;
      try {
        for (const id of selected) {
          const fd = new FormData();
          fd.set("fileId", id);
          try {
            await deleteFileAction(fd);
          } catch {
            failed++;
          }
        }
      } finally {
        setDeleteFailed(failed);
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
        Здесь пока пусто.
      </div>
    );
  }

  const fileIds = files.map((f) => f.id);

  return (
    <>
      {fileIds.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => downloadAll(fileIds, zipName)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <DownloadCloud size={15} />
            Скачать всё
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {files.map((file) => {
          const Icon = getFileIcon(file.mimeType);
          const img = isImage(file.mimeType);
          return (
            <div
              key={file.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
            >
              {/* Обёртка-label пустая (только рамка), поэтому доступное имя
                  чекбоксу даёт aria-label на самом input, а не текст label. */}
              {canEdit && (
                <label className="absolute left-2 top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-neutral-200 bg-white/90">
                  <input
                    type="checkbox"
                    aria-label={`Выбрать «${file.name}»`}
                    checked={selected.has(file.id)}
                    onChange={() => toggle(file.id)}
                    className="h-3.5 w-3.5"
                  />
                </label>
              )}

              {img ? (
                <button
                  type="button"
                  onClick={() => setLightbox(file)}
                  className="flex aspect-square w-full items-center justify-center bg-neutral-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- предпросмотр произвольного файла в S3, next/image не настроен для внешнего домена */}
                  <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-neutral-50 text-neutral-400">
                  <Icon size={32} strokeWidth={1.5} />
                </div>
              )}

              <div className="flex flex-col gap-0.5 p-2.5">
                <div className="truncate text-xs font-medium text-neutral-900" title={file.name}>
                  {file.name}
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span>{formatSize(file.size)}</span>
                  <a href={downloadUrl(file.id)} className="flex items-center gap-1 text-indigo-600 hover:underline">
                    <Download size={11} />
                    Скачать
                  </a>
                </div>
              </div>

              {canEdit && (
                <form action={deleteFileAction} className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <input type="hidden" name="fileId" value={file.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Удалить файл «${file.name}»?`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* Панель остаётся видимой и с пустым выделением, пока есть о чём
          сообщить: выделение снимается сразу после удаления, а сообщение о
          неудачных файлах должно остаться на глазах. */}
      {canEdit && (selected.size > 0 || deleteFailed > 0) && (
        <div className="fixed inset-x-4 bottom-6 z-40 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 shadow-lg">
            {selected.size > 0 && (
              <>
                <span className="text-sm text-neutral-600">Выбрано: {selected.size}</span>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  <Layers size={14} />
                  Добавить в коллекцию
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {deleting ? "Удаление…" : "Удалить"}
                </button>
              </>
            )}
            {deleteFailed > 0 && (
              <span className="text-sm text-red-600">Не удалось удалить: {deleteFailed}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setDeleteFailed(0);
              }}
              className="text-sm text-neutral-400 hover:text-neutral-600"
            >
              {selected.size > 0 ? "Отмена" : "Скрыть"}
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Закрыть просмотр"
            title="Закрыть просмотр"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- увеличенный просмотр той же картинки, next/image не настроен */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {addOpen && (
        <AddToCollectionModal
          fileIds={[...selected]}
          collections={collections}
          onClose={() => {
            setAddOpen(false);
            setSelected(new Set());
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          message={`Удалить выбранные файлы (${selected.size})? Это необратимо.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deleteSelected}
        />
      )}
    </>
  );
}
