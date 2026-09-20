"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/components/useFocusTrap";

// Общая модалка подтверждения (правка пользователя: браузерный `confirm()`
// выглядит как системный попап, не как часть вики). Используется
// ConfirmSubmitButton и точечными местами с ручным подтверждением (массовое
// удаление файлов в FileGrid) — единственное место с этой разметкой.
export default function ConfirmDialog({
  message,
  confirmLabel = "Удалить",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Первой в фокус попадает «Отмена» (она первая в разметке) — безопасный
  // выбор для диалога, у которого вторая кнопка необратимо удаляет.
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // Escape закрывает модалку — тот же приём, что у components/ui/Select.tsx.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={message}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={18} />
          </div>
          <p className="pt-1.5 text-sm text-neutral-700">{message}</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
