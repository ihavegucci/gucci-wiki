"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Удержание фокуса внутри модалки — единственная реализация на весь проект
// (Escape и role="dialog" у модалок уже есть, не хватало только этого).
// Возвращает ref, который вешается на контейнер диалога.
//
// Почему список фокусируемых пересчитывается на каждый Tab, а не один раз при
// открытии: содержимое модалок меняется по ходу жизни (список коллекций
// догружается, форма сменяется на «Спасибо»), и запомненный список начал бы
// указывать на удалённые из DOM узлы.
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const restoreTo = document.activeElement as HTMLElement | null;

    // offsetParent === null отсекает скрытые узлы (display:none), но не
    // position:fixed — сам контейнер модалки фиксирован, поэтому фильтр
    // применяется к потомкам, а не к нему самому.
    const focusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    focusable()[0]?.focus();

    // Стрелочная функция, а не объявление: объявление всплывает наверх блока,
    // и TypeScript перестаёт видеть, что `container` выше уже проверен.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      // Фокус мог уйти из модалки (клик мимо, программный focus) — тогда Tab
      // возвращает его внутрь, а не листает страницу под модалкой.
      if (!container.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Элемент мог быть удалён из DOM вместе с модалкой (кнопка внутри
      // списка, который перерисовался) — тогда focus() просто ничего не делает.
      restoreTo?.focus?.();
    };
  }, [active]);

  return ref;
}
