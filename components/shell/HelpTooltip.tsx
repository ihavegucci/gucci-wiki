"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, ExternalLink } from "lucide-react";
import { useAnchoredPanel } from "@/components/ui/useAnchoredPanel";

// Ссылка построена из имени автора, указанного в самой лицензии
// (копирайт "ihavegucci") — точный URL профиля пользователь не продиктовал
// (R11.1 в plan.md, ПРИНЯТО ЗА ТЕБЯ); поправить одной строкой, если профиль
// называется иначе.
const GITHUB_URL = "https://github.com/ihavegucci";

const MIT_LICENSE = `MIT License

Copyright (c) 2026 ihavegucci

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const PANEL_WIDTH = 320;

// Панель у иконки помощи (R11): фиксированный текст, ничего не грузит.
//
// Позиция считается в JS и рендерится порталом — тот же приём и по той же
// причине, что у components/ui/Select.tsx. Раньше это был обычный
// `absolute right-0`: панель прижималась правым краем к кнопке и уходила
// ВЛЕВО на свою ширину. На десктопе места слева хватало, а на телефоне
// кнопка помощи стоит в середине шапки, и панель уезжала за левый край
// экрана (нашёл пользователь, дважды). Ограничение ширины это не лечит —
// лечит только зажим позиции в границы окна, как здесь.
export default function HelpTooltip() {
  const [open, setOpen] = useState(false);
  const { anchorRef, rect } = useAnchoredPanel<HTMLDivElement>(open, () => setOpen(false), PANEL_WIDTH);
  // Наведение отслеживается отдельно у кнопки и у панели: после переезда в
  // портал панель больше не потомок кнопки, и CSS group-hover на неё не
  // распространяется. Небольшая задержка на закрытие — чтобы курсор успел
  // перейти с кнопки на панель, не гася её по дороге.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hideSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div ref={anchorRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="О проекте"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
      >
        <HelpCircle size={18} />
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            className="z-50 rounded-xl border border-neutral-200 bg-white px-4 pb-4 pt-3 shadow-lg"
          >
            <p className="text-sm font-semibold text-neutral-900">Open-source · Self-hosted</p>
            <p className="mt-1 text-sm text-neutral-500">
              gucci-wiki — открытый проект, который можно развернуть у себя.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Разработчик:{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
              >
                ihavegucci
                <ExternalLink size={12} />
              </a>
            </p>
            <p className="mt-2 text-xs font-semibold tracking-wide text-neutral-400">ЛИЦЕНЗИЯ MIT</p>
            <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-2.5 font-sans text-[11px] leading-snug text-neutral-500">
              {MIT_LICENSE}
            </pre>
          </div>,
          document.body
        )}
    </div>
  );
}
