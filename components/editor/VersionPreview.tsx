"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import { Eye, X, Loader2 } from "lucide-react";
import ResizableImageView from "@/components/editor/ResizableImageView";
import { useFocusTrap } from "@/components/useFocusTrap";
import "@/components/editor/tiptap.css";

// Предпросмотр сохранённой версии рендерится через сам Tiptap в режиме
// только-чтение, а НЕ через dangerouslySetInnerHTML. Причина принципиальная:
// в истории лежит HTML, который когда-то ввёл пользователь, и вставлять его
// в документ как разметку — ровно тот путь, которым в этот проект уже
// приходил stored XSS (QA-прогон 1). Tiptap разбирает HTML в свою схему
// ProseMirror, то есть всё, чего в схеме нет (скрипты, обработчики,
// произвольные атрибуты), просто не доживает до DOM.
const ReadOnlyImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function PreviewBody({ content }: { content: string }) {
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), ReadOnlyImage],
    content,
  });
  return <EditorContent editor={editor} />;
}

function PreviewDialog({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  // Хук держит фокус внутри окна, но закрытие по Escape — не его забота
  // (в остальных модалках проекта оно тоже сделано отдельно).
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Содержимое версии подгружается при открытии, а не приезжает пропсом со
  // страницы: иначе RSC-payload истории несёт полный HTML всех 20 версий
  // сразу, хотя открыт максимум один предпросмотр.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pages/versions/${versionId}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Не удалось загрузить версию.");
          return;
        }
        setContent(data.content ?? "");
      } catch {
        if (!cancelled) setError("Не удалось загрузить версию — проверьте соединение.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Предпросмотр версии"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h2 className="font-semibold text-neutral-900">Как выглядела статья в этой версии</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть предпросмотр"
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="tiptap-content min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : content === null ? (
            <p className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 size={15} className="animate-spin" /> Загружаем версию…
            </p>
          ) : (
            <PreviewBody content={content} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function VersionPreview({ versionId }: { versionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        <Eye size={15} />
        Посмотреть
      </button>
      {/* Окно создаётся только когда открыто — иначе на странице с 20
          версиями поднялось бы 20 экземпляров Tiptap. */}
      {open && <PreviewDialog versionId={versionId} onClose={() => setOpen(false)} />}
    </>
  );
}
