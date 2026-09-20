"use client";

import Link from "next/link";
import { Settings, Plus, Menu } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import SearchBar from "@/components/SearchBar";
import HelpTooltip from "@/components/shell/HelpTooltip";

export default function Topbar({
  canCreate = false,
  isAdmin = false,
  onMenuClick,
}: {
  canCreate?: boolean;
  isAdmin?: boolean;
  // Гамбургер виден только на <768px (R01.2/R01.3) — состояние открыт/закрыт
  // держит MobileSidebar, Topbar сам ничего не знает про мобильный сайдбар.
  onMenuClick?: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 bg-white px-4 py-3 md:h-16 md:flex-nowrap md:gap-4 md:px-6 md:py-0">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Открыть меню"
          className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 md:hidden"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <SearchBar />
      </div>

      {/* На <768px переносится во вторую строку (R01.3) — `w-full` в
          flex-wrap ряду не помещается рядом с гамбургером+поиском и уходит
          на новую строку; на ≥768px это тот же единственный ряд, что и раньше. */}
      <div className="flex w-full items-center justify-end gap-1.5 md:w-auto md:ml-auto">
        <HelpTooltip />
        <NotificationBell />
        {/* /settings доступен только Admin (requireAdmin() на каждом роуте) —
            нашла слепая проверка (G3): иконка была видна всем ролям, хотя
            переход всё равно отбивался на сервере. Теперь просто не показываем
            то, чем нельзя воспользоваться. */}
        {isAdmin && (
          <Link
            href="/settings"
            aria-label="Настройки"
            title="Настройки"
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Settings size={18} />
          </Link>
        )}
        {canCreate && (
          <Link
            href="/spaces/new"
            className="ml-2 flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            <Plus size={16} />
            Создать
          </Link>
        )}
      </div>
    </header>
  );
}
