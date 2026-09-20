"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatSize } from "@/components/files/utils";
import type { UploadProgress as Progress } from "@/lib/upload/xhrUpload";

export type UploadState = Progress & {
  name: string;
  // «2 из 5» при загрузке нескольких файлов подряд — одна полоса на текущий
  // файл, а не пять полос сразу: очередь всё равно строго последовательная.
  note?: string;
};

// Единственная разметка полосы прогресса на весь проект — используется всеми
// тремя местами, откуда браузер отправляет файл («Файлы», картинка в статье,
// логотип в /settings).
//
// Рендерится порталом в body, а не в поток на месте вызова: полоса живёт
// только во время загрузки, и появляясь/исчезая в потоке, она раздвигала и
// схлопывала соседние кнопки — интерфейс дёргался на каждой загрузке. У
// фиксированного поп-апа своя высота на разметку не влияет вообще. Портал
// нужен именно потому, что вызывающие места лежат внутри тулбаров и карточек
// со своими `overflow` и `position` — обычный `position: fixed` там обрезался
// бы или считался от неожиданного предка (тот же приём и по той же причине,
// что у `components/ui/Select.tsx`).
export default function UploadProgress({
  state,
  onCancel,
}: {
  state: UploadState;
  onCancel?: () => void;
}) {
  const { name, loaded, total, note } = state;
  const percent = total === null ? null : Math.min(100, Math.round((loaded / total) * 100));
  // Байты уже ушли, но ответа ещё нет — в этот момент файл льётся из
  // приложения в S3. Без подписи застывшие «100%» читаются как зависание.
  const label =
    total === null
      ? formatSize(loaded)
      : percent === 100
        ? "Обработка…"
        : `${percent}% · ${formatSize(total)}`;

  // На сервере портала нет. Полоса и так появляется только после клика
  // пользователя, но проверка обязательна: createPortal при SSR недоступен.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg md:inset-x-auto md:right-6 md:w-80"
    >
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="min-w-0 flex-1 truncate text-neutral-700" title={name}>
          {name}
        </span>
        {note && <span className="shrink-0">{note}</span>}
        <span className="shrink-0 tabular-nums">{label}</span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={`Отменить загрузку «${name}»`}
            title="Отменить загрузку"
            className="shrink-0 rounded-md p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full bg-neutral-900 ${
            percent === null ? "animate-pulse" : "transition-[width] duration-200"
          }`}
          style={{ width: percent === null ? "100%" : `${percent}%` }}
        />
      </div>
    </div>,
    document.body
  );
}
