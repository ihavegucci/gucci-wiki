"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addFilesToCollectionAction, createCollectionAction } from "@/lib/files/actions";
import { useFocusTrap } from "@/components/useFocusTrap";

// Модалка «Добавить в коллекцию» (кусок 6, R12) — выбрать существующую или
// создать новую. Server actions вызываются напрямую как функции (без формы),
// т.к. после создания коллекции нужен её id для второго вызова.
export default function AddToCollectionModal({
  fileIds,
  collections,
  onClose,
}: {
  fileIds: string[];
  collections: { id: string; title: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // Escape закрывает модалку — тот же приём, что у components/ui/Select.tsx.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function addTo(collectionId: string) {
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("collectionId", collectionId);
      for (const id of fileIds) fd.append("fileIds", id);
      await addFilesToCollectionAction(fd);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить файлы.");
      setPending(false);
    }
  }

  async function createAndAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("title", title);
      const collection = await createCollectionAction(fd);
      await addTo(collection.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать коллекцию.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Добавить в коллекцию"
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-neutral-900">Добавить в коллекцию</div>
        <p className="mt-1 text-xs text-neutral-500">Выбрано файлов: {fileIds.length}</p>

        {collections.length > 0 && (
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => addTo(c.id)}
                className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50"
              >
                {c.title}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-neutral-100 pt-3">
          <div className="text-xs font-medium text-neutral-500">Или создать новую</div>
          <div className="mt-2 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Название коллекции"
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              disabled={pending || !newTitle.trim()}
              onClick={createAndAdd}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              Создать
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
