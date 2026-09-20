"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/shell/Topbar";

// Тонкая клиентская обёртка вокруг серверного `Sidebar` (R01.2). Сам
// `Sidebar` остаётся async server component и рендерится снаружи (в
// `app/(app)/layout.tsx`), сюда попадает уже готовым JSX через проп
// `sidebar` — клиентский компонент не может импортировать async server
// component напрямую. Состояние открыт/закрыт живёт только здесь и
// прокидывается в `Topbar` через `onMenuClick`, т.к. сама кнопка-гамбургер
// уже нарисована в Topbar.
export default function MobileSidebar({
  sidebar,
  canCreate,
  isAdmin,
  children,
}: {
  sidebar: React.ReactNode;
  canCreate?: boolean;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Закрытая панель уезжает за экран только трансформом — её ссылки
  // оставались в обходе табом. `inert` убирает их из фокуса и не трогает
  // анимацию, но применять его можно ТОЛЬКО ниже md: с 768px сайдбар
  // `md:static` и виден всегда, там `open` не значит ничего. Единая точка
  // перелома проекта — 768px, тот же, что у Tailwind `md`.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      {/* На <768px — выезжающая панель поверх контента (fixed + translate);
          на ≥768px — `md:static` полностью снимает fixed/inset/z-index,
          сайдбар встаёт в обычный flex-поток, как и было раньше. Клик
          где угодно внутри (в т.ч. по ссылке — событие всплывает) закрывает
          панель на мобильном. */}
      <div
        onClick={() => setOpen(false)}
        inert={isMobile && !open}
        className={`fixed inset-y-0 left-0 z-40 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar canCreate={canCreate} isAdmin={isAdmin} onMenuClick={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
