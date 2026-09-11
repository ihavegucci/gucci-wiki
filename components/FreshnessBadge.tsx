"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, TriangleAlert, CircleAlert } from "lucide-react";
import { useAnchoredPanel } from "@/components/ui/useAnchoredPanel";
import type { FreshnessStatus } from "@/lib/freshness/compute";

const STYLES: Record<FreshnessStatus, string> = {
  fresh: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  expired: "border-red-200 bg-red-50 text-red-700",
};

const LABELS: Record<FreshnessStatus, string> = {
  fresh: "Свежая",
  warn: "Пора проверить",
  expired: "Просрочена",
};

// Иконки, а не эмодзи: эмодзи рисует шрифт системы, поэтому они выбиваются
// из оформления (своя палитра, свой вес, разный вид в Windows и macOS), а
// весь остальной интерфейс собран на lucide. Цвет иконка берёт у текста
// бейджа через currentColor, то есть сама подстраивается под статус.
const ICONS: Record<FreshnessStatus, typeof CircleCheck> = {
  fresh: CircleCheck,
  warn: TriangleAlert,
  expired: CircleAlert,
};

export default function FreshnessBadge({
  pageId,
  status,
  daysSinceReview,
  reviewIntervalDays,
  autoDowngraded,
  canEdit,
}: {
  pageId: string;
  status: FreshnessStatus;
  daysSinceReview: number;
  reviewIntervalDays: number;
  autoDowngraded: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ttl, setTtl] = useState(reviewIntervalDays);
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState({ status, daysSinceReview });
  const [error, setError] = useState<string | null>(null);

  // Раньше неудачный запрос (403/400/сеть) просто ничего не делал — кнопка
  // переставала крутиться, и выглядело так, будто клик не сработал вообще
  // (тот же паттерн, что CLAUDE.md уже запрещает для fetch к своему API).
  async function save(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/freshness", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, ...body }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setCurrent({ status: data.status, daysSinceReview: data.daysSinceReview });
        if (typeof data.reviewIntervalDays === "number") setTtl(data.reviewIntervalDays);
        setOpen(false);
      } else {
        setError(data?.error || "Не удалось сохранить.");
      }
    } catch {
      setError("Не удалось сохранить: проблема с сетью.");
    } finally {
      setPending(false);
    }
  }

  // Периодичность берётся из состояния (ttl), а не из исходного пропа —
  // после смены и сохранения проп остаётся прежним до перезагрузки страницы,
  // и подсказка показывала старое число.
  const title = autoDowngraded
    ? "Статью давно не открывали, хотя пространство активно — статус понижен раньше срока"
    : `Пересмотр раз в ${ttl} дн.`;

  const StatusIcon = ICONS[current.status];

  // Та же история, что у колокольчика и подсказки в шапке: `absolute right-0`
  // раскрывал панель влево на свою ширину и уводил её за край узкого экрана.
  // Позиция считается и зажимается в границы окна, панель рисуется порталом.
  const { anchorRef, rect } = useAnchoredPanel<HTMLDivElement>(open && canEdit, () => setOpen(false), 256);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => canEdit && setOpen((v) => !v)}
        title={title}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${STYLES[current.status]} ${
          canEdit ? "cursor-pointer hover:opacity-80" : "cursor-default"
        }`}
      >
        <StatusIcon size={13} strokeWidth={2.25} className="shrink-0" />
        {LABELS[current.status]} · {current.daysSinceReview} дн. назад
      </button>

      {open && canEdit && rect && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: rect.top + 8, left: rect.left, width: rect.width }}
          className="z-50 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
        >
          <label className="block text-xs font-medium text-neutral-500">Пересматривать каждые (дней)</label>
          <input
            type="number"
            min={1}
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || ttl <= 0}
              onClick={() => save({ reviewIntervalDays: ttl })}
              className="flex-1 rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save({ markReviewed: true })}
              className="flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              Проверено сейчас
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>,
        document.body
      )}
    </div>
  );
}
