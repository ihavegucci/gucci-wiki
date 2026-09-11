"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_MARGIN = 8;

// Позиция всплывающей панели относительно кнопки, зажатая в границы окна.
//
// Чистая функция — потому что именно этот расчёт трижды приводил к панели за
// краем экрана (лицензия в шапке, уведомления, свежесть), а увидеть такое
// можно только глазами на узком экране. Тест на неё —
// test/anchored-panel.test.ts.
//
// Панель выравнивается по ПРАВОМУ краю кнопки: так она открывается «внутрь»
// экрана у элементов в правой части шапки. Но если слева не хватает места
// (кнопка стоит в середине узкого экрана — ровно случай мобильной шапки),
// панель прижимается к краю окна вместо того, чтобы уехать за него.
export function panelGeometry(buttonRight: number, viewportWidth: number, preferredWidth: number) {
  const width = Math.min(preferredWidth, viewportWidth - VIEWPORT_MARGIN * 2);
  const maxLeft = viewportWidth - width - VIEWPORT_MARGIN;
  return { width, left: Math.max(VIEWPORT_MARGIN, Math.min(buttonRight - width, maxLeft)) };
}

// Общая обвязка для панели, которую рисуют порталом: измеряет кнопку при
// открытии и просит закрыться при прокрутке, ресайзе и Escape.
//
// Портал нужен потому, что панель иначе обрезается или считает координаты от
// неожиданного предка, если попадает внутрь контейнера с overflow или своим
// position (правило проекта, см. CLAUDE.md). Закрытие при прокрутке — потому
// что position: fixed за кнопкой не следует, и панель «отклеилась» бы.
export function useAnchoredPanel<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
  preferredWidth: number
) {
  const anchorRef = useRef<T>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const box = anchorRef.current.getBoundingClientRect();
    const { width, left } = panelGeometry(box.right, window.innerWidth, preferredWidth);
    // Вплотную под кнопкой, без зазора: пустая полоса между триггером и
    // панелью гасила бы наведение раньше, чем курсор дойдёт до панели.
    setRect({ top: box.bottom, left, width });
  }, [open, preferredWidth]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => onDismiss();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss]);

  return { anchorRef, rect };
}
