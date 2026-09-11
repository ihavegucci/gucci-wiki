"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

// Единый стиль для всех выпадающих списков (R06). Первая версия оставляла
// нативный `<select>` и стилизовала только закрытую рамку — правка
// пользователя: сам открытый список браузер рисует нативным попапом,
// который CSS не может достать (ни закруглений, ни своих цветов hover,
// ни отступов) ни в одном браузере. Единственный способ стилизовать список
// целиком — не полагаться на `<select>` вообще, а нарисовать список самим.
//
// Список рендерится через портал в `document.body`, а не как обычный
// `position: absolute` внутри компонента — нашёл пользователь: список
// обрезался, если Select лежит внутри контейнера с `overflow-hidden`
// (например, таблица «Пользователей», у которой overflow-hidden обрезает
// таблицу по скруглённым углам). Портал не зависит от overflow/z-index
// родителей, позиция считается вручную по координатам кнопки.
//
// Совместимость с формами (в т.ч. server actions вроде `<form action={...}>`)
// сохранена через скрытый `<input type="hidden">` с тем же `name` — обычный
// `FormData` подхватывает его как обычное поле формы, форме всё равно, что
// значение выставляет кастомный UI, а не браузерный `<select>`.
export default function Select({
  name,
  defaultValue,
  options,
  className = "",
  disabled,
}: {
  name: string;
  defaultValue: string;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Позиция считается заново при каждом открытии (кнопка могла сдвинуться
  // между открытиями — например, после редактирования соседних полей).
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const box = buttonRef.current.getBoundingClientRect();
    // Зажим по ширине окна (R01.10i) — на узком экране кнопка может стоять
    // достаточно близко к правому краю, чтобы панель той же ширины вылезла
    // за viewport; сдвигаем левый край влево ровно настолько, чтобы влезть,
    // с отступом 8px от края.
    const left = Math.min(box.left, window.innerWidth - box.width - 8);
    setRect({ top: box.bottom + 4, left: Math.max(8, left), width: box.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function isOutside(target: EventTarget | null) {
      const node = target as Node;
      return !buttonRef.current?.contains(node) && !panelRef.current?.contains(node);
    }
    function onClickOutside(e: MouseEvent) {
      if (isOutside(e.target)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Скролл где угодно на странице (не только окна — capture-фаза ловит
    // скролл и во вложенных прокручиваемых контейнерах) закрывает список,
    // а не пересчитывает позицию — иначе он "отклеится" от кнопки.
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`}>
      <input type="hidden" name={name} value={value} />
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white py-1.5 pl-2.5 pr-2 text-sm text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-neutral-400 disabled:opacity-50"
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-50 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setValue(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 ${
                  option.value === value ? "font-medium text-neutral-900" : "text-neutral-600"
                }`}
              >
                {option.label}
                {option.value === value && <Check size={14} className="shrink-0 text-neutral-400" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
