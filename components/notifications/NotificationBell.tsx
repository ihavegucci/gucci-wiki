"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAnchoredPanel } from "@/components/ui/useAnchoredPanel";

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 45_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Раньше и загрузка, и PATCH глотали ошибку молча (`.catch(() => {})`,
  // без проверки res.ok) — запрещено правилом проекта: причина должна быть
  // видна. Показываем её строкой прямо в панели уведомлений.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Не удалось загрузить уведомления.");
        return;
      }
      setItems(data?.items ?? []);
      setUnreadCount(data?.unreadCount ?? 0);
      setError(null);
    } catch {
      setError("Не удалось подключиться к серверу.");
    }
  }, []);

  useEffect(() => {
    // Опрос внешнего источника (собственный API) по интервалу — ровно тот
    // случай, для которого сам этот effect и существует ("подписка на
    // обновления из внешней системы"), поэтому точечно отключаем правило.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Не удалось отметить прочитанным.");
        return;
      }
    } catch {
      setError("Не удалось подключиться к серверу.");
      return;
    }
    load();
  }

  // Панель рендерится порталом с позицией, зажатой в границы окна. Раньше
  // это был `absolute right-0 w-80`: панель прижималась правым краем к
  // колокольчику и раскрывалась влево на свои 320px. На десктопе слева места
  // хватает, а в мобильной шапке колокольчик стоит в середине — и панель
  // уезжала за левый край экрана (нашёл пользователь).
  const { anchorRef, rect } = useAnchoredPanel<HTMLDivElement>(open, () => setOpen(false), 320);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Уведомления (непрочитанных: ${unreadCount})` : "Уведомления"}
        aria-expanded={open}
        title="Уведомления"
        className="relative rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: rect.top + 8, left: rect.left, width: rect.width }}
          className="z-30 rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-neutral-700">Уведомления</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => patch({ all: true })}
                className="text-xs text-indigo-600 hover:underline"
              >
                Прочитать всё
              </button>
            )}
          </div>
          {error && <p className="border-b border-neutral-100 px-4 py-2.5 text-sm text-red-600">{error}</p>}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-400">Пока пусто</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "#"}
                  onClick={() => {
                    setOpen(false);
                    if (!n.read) patch({ id: n.id });
                  }}
                  className={`block border-b border-neutral-50 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-neutral-50 ${
                    n.read ? "text-neutral-400" : "text-neutral-700"
                  }`}
                >
                  <p className="leading-snug">{n.message}</p>
                  <p className="mt-1 text-xs text-neutral-400">{new Date(n.createdAt).toLocaleString("ru-RU")}</p>
                </Link>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
