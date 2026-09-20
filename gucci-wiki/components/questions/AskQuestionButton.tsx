"use client";

import { useActionState, useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { createQuestionAction, type CreateQuestionState } from "@/lib/questions/actions";
import { useFocusTrap } from "@/components/useFocusTrap";

// Кнопка «Создать запрос» на главной (кусок 4, R11) — открывает маленькую
// модалку с формой, сабмит вызывает createQuestionAction. Единственный
// клиентский интерактив здесь — открытие/закрытие модалки и обратная связь.
export default function AskQuestionButton() {
  const [open, setOpen] = useState(false);
  // Счётчик открытий как key модалки: useActionState держит своё состояние,
  // пока компонент смонтирован, поэтому после первого успеха модалка
  // открывалась сразу с «Спасибо» и без полей — форма рендерится только в
  // ветке else. Пересоздание по key сбрасывает состояние экшена начисто.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        <MessageSquarePlus size={15} />
        Создать запрос
      </button>

      {open && <AskQuestionModal key={openCount} onClose={() => setOpen(false)} />}
    </>
  );
}

function AskQuestionModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<CreateQuestionState, FormData>(
    createQuestionAction,
    null
  );
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // После успеха — короткое "спасибо", затем модалка закрывается сама.
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Задать вопрос"
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-neutral-900">Задать вопрос</div>
        <p className="mt-1 text-xs text-neutral-500">
          Вопрос увидят редакторы и администратор.
        </p>

        {state?.ok ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Спасибо, вопрос отправлен.
          </p>
        ) : (
          <form action={formAction} className="mt-3 space-y-3">
            <textarea
              name="text"
              required
              rows={4}
              placeholder="О чём хотите спросить?"
              className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
              >
                {pending ? "Отправка…" : "Отправить"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
