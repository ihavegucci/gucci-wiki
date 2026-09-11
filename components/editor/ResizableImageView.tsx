"use client";

import { useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const MIN_SIZE = 40;

// Ручка ресайза в правом нижнем углу картинки (кусок 6, R07). Без Shift —
// ширина/высота меняются независимо. С зажатым Shift — высота пересчитана
// из ширины по соотношению сторон исходного изображения (naturalWidth/Height
// на момент начала перетаскивания, не текущих attrs — так соотношение не
// "плывёт" от повторных ресайзов с разными модификаторами).
export default function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  // `editable: false` у useEditor (Viewer) отключает контент-эдитабл и
  // типографский ввод, но НЕ блокирует собственные imperative-обработчики
  // NodeView — pointerdown на ручке ресайза срабатывал бы и для Viewer, а
  // `updateAttributes` всё равно диспатчил бы транзакцию. Нашёл пользователь:
  // Viewer мог менять размер картинки в статье, хотя редактировать её вообще
  // не должен. Ручка ресайза и перетаскивание узла — только когда editable.
  const editable = editor.isEditable;

  function onHandlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const img = imgRef.current;
    if (!img) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = img.getBoundingClientRect().width;
    const startHeight = img.getBoundingClientRect().height;
    const ratio = (img.naturalWidth || startWidth) / (img.naturalHeight || startHeight);

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const width = Math.max(MIN_SIZE, Math.round(startWidth + dx));
      let height = Math.max(MIN_SIZE, Math.round(startHeight + dy));
      if (ev.shiftKey) {
        height = Math.round(width / ratio);
      }
      updateAttributes({ width, height });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    // Перетаскивание узла у Tiptap работает не через нативный HTML5-drag
    // сам по себе, а через `onDragStart` из NodeViewWrapper, который ищет
    // ближайший элемент с атрибутом `data-drag-handle` от точки, где начался
    // drag (см. @tiptap/core NodeView.onDragStart) — без него обработчик
    // молча ничего не делает. `draggable` включает сам жест на span,
    // `data-drag-handle` говорит Tiptap, что двигать нужно весь этот узел
    // (а не игнорировать событие). `draggable={false}` на <img> ниже
    // отключает МЕШАЮЩЕЕ нативное перетаскивание картинки браузером (у
    // <img> оно включено по умолчанию и раньше приводило к дублированию:
    // браузер тащил именно <img> своей нативной копией данных, минуя
    // Tiptap, — ProseMirror не знал об этом и не удалял исходный узел).
    // Без data-drag-handle (только draggable+img draggable=false) картинку
    // нельзя было сдвинуть вообще — это тоже проверено вручную.
    <NodeViewWrapper
      as="span"
      draggable={editable}
      data-drag-handle={editable ? "true" : undefined}
      className="relative inline-block leading-none"
      data-selected={selected}
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? ""}
        width={node.attrs.width ?? undefined}
        height={node.attrs.height ?? undefined}
        draggable={false}
        style={{ display: "block", maxWidth: "100%" }}
      />
      {editable && (
        // Видимая ручка остаётся 12x12 (h-3 w-3, вложенный span) — область
        // попадания вокруг неё увеличена до 32x32 (родительский span, тот
        // же центр за счёт translate-1/2 от собственного размера + flex-
        // центрирования внутри), иначе на тач-экране палец промахивается
        // мимо тонкой полоски. `touch-none` — чтобы жест по ручке не
        // прокручивал страницу вместо ресайза (Pointer Events сами по себе
        // не отменяют touch-action браузера).
        <span
          onPointerDown={onHandlePointerDown}
          className="absolute bottom-0 right-0 flex h-8 w-8 translate-x-1/2 translate-y-1/2 touch-none cursor-nwse-resize items-center justify-center"
        >
          <span className="h-3 w-3 rounded-sm border border-white bg-neutral-900" />
        </span>
      )}
    </NodeViewWrapper>
  );
}
