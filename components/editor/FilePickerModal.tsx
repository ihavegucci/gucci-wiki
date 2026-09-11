"use client";

import { useCallback, useEffect, useState } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";

type ImageItem = { id: string; name: string; url: string };
type Page = { items: ImageItem[]; nextCursor: string | null };

// Загрузка страницы вынесена из компонента и ничего не выставляет в
// состояние: вызов из useEffect у функции, которая сама зовёт setState,
// считается синхронным setState в эффекте (react-hooks/set-state-in-effect).
// Здесь — только запрос и разбор ответа, состояние меняет вызывающий.
//
// Статус проверяется до .json(): при 401/500 тело — `{error: ...}`, без
// `items`, и раньше это давало общую фразу вместо настоящей причины.
async function fetchImages(cursor: string | null): Promise<Page | { error: string }> {
  try {
    const res = await fetch(`/api/files/images${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: data?.error ?? "Не удалось загрузить список файлов." };
    return { items: (data?.items as ImageItem[]) ?? [], nextCursor: data?.nextCursor ?? null };
  } catch {
    return { error: "Не удалось подключиться к серверу." };
  }
}

// Модалка «Выбрать из файлов» (кусок 6, R08) — вставляет уже загруженную
// картинку без повторной загрузки байт. Стиль — как у AddToCollectionModal.
export default function FilePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ImageItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // true с самого начала: первая страница запрашивается сразу при открытии,
  // и с false первый кадр модалки был бы пустым, без «Загрузка…».
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  const applyPage = useCallback((result: Page | { error: string }) => {
    if ("error" in result) setError(result.error);
    else {
      // Дозагрузка дописывает страницу к уже показанному, а не заменяет его.
      setItems((prev) => [...(prev ?? []), ...result.items]);
      setNextCursor(result.nextCursor);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchImages(null).then((result) => {
      if (!cancelled) applyPage(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPage]);

  function loadMore(cursor: string) {
    setLoading(true);
    setError(null);
    fetchImages(cursor).then(applyPage);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Выбрать из файлов"
        className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-neutral-900">Выбрать из файлов</div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!error && items === null && loading && <p className="mt-3 text-sm text-neutral-400">Загрузка…</p>}
        {!error && items?.length === 0 && (
          <p className="mt-3 text-sm text-neutral-400">Пока нет загруженных картинок.</p>
        )}

        {items && items.length > 0 && (
          <div className="mt-3 max-h-96 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.name}
                  onClick={() => onSelect(item.url)}
                  className="aspect-square overflow-hidden rounded-lg border border-neutral-200 transition-colors hover:border-neutral-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            {/* Кнопка, а не автодогрузка по скроллу: список лежит внутри
                собственной прокрутки модалки, и IntersectionObserver тут
                пришлось бы настраивать на этот контейнер — лишняя механика
                ради того же результата. */}
            {nextCursor && (
              <button
                type="button"
                disabled={loading}
                onClick={() => loadMore(nextCursor)}
                className="mt-3 w-full rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                {loading ? "Загрузка…" : "Показать ещё"}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
