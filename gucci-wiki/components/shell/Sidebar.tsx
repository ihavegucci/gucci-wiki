import Link from "next/link";
import { Home, BellRing, Send, Users, MessageSquare, Map, Folder, LayoutGrid } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getSpaceIcon } from "@/lib/spaces/icons";
import type { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import { getSettings } from "@/lib/settings/settings";
import LogoutButton from "@/components/shell/LogoutButton";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// Сколько пространств показывать прямо в меню, прежде чем предложить
// перейти на полный список — правка пользователя: при большом числе
// пространств список в сайдбаре сам обзаводился прокруткой, что выглядело
// некрасиво. Полный список — уже готовая страница /spaces (карточками).
//
// У Admin в нижнем блоке на два пункта больше (Пользователи, Рассылка в
// Telegram — их не видят Editor/Viewer), поэтому свободного места под
// список пространств у него меньше: то же число сверху давало прокрутку
// именно у Admin, хотя у остальных ролей — нет (нашёл пользователь).
const MAX_SIDEBAR_SPACES_ADMIN = 5;
const MAX_SIDEBAR_SPACES_OTHER = 8;

export default async function Sidebar({ user }: { user: CurrentUser }) {
  const [spaces, settings] = await Promise.all([
    prisma.space.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, icon: true },
    }),
    getSettings(),
  ]);
  const maxSidebarSpaces = user?.role === "ADMIN" ? MAX_SIDEBAR_SPACES_ADMIN : MAX_SIDEBAR_SPACES_OTHER;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-baseline gap-2 px-5 pt-6 pb-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-neutral-900">
          gucci-wiki
        </Link>
        {/* Название компании (R18) — серым и мельче, справа от "gucci-wiki",
            только если задано в /settings. */}
        {settings.companyName && (
          <span className="truncate text-xs font-medium text-neutral-400">{settings.companyName}</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
        >
          <Home size={17} strokeWidth={2} />
          Главная
        </Link>

        {/* «Карты» и «Файлы» (R06, R01) — видны всем ролям, создание внутри
            само ограничено canEdit на уровне страниц (куски 5-6). */}
        <Link
          href="/roadmaps"
          className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <Map size={17} strokeWidth={2} className="text-neutral-400" />
          Карты
        </Link>
        <Link
          href="/files"
          className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <Folder size={17} strokeWidth={2} className="text-neutral-400" />
          Файлы
        </Link>

        <div className="mt-6 px-3 text-xs font-semibold tracking-wide text-neutral-400">
          ПРОСТРАНСТВА
        </div>
        <ul className="mt-1 space-y-0.5">
          {spaces.slice(0, maxSidebarSpaces).map((space) => {
            const Icon = getSpaceIcon(space.icon);
            return (
              <li key={space.id}>
                <Link
                  href={`/spaces/${space.slug}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
                >
                  <Icon size={17} strokeWidth={2} className="text-neutral-400" />
                  {space.name}
                </Link>
              </li>
            );
          })}
          {spaces.length === 0 && (
            <li className="px-3 py-2 text-sm text-neutral-400">Пространств пока нет</li>
          )}
        </ul>

        {/* «Все пространства» — последний пункт блока (правка пользователя),
            ведёт на полный список карточками (app/(app)/spaces/page.tsx). */}
        <Link
          href="/spaces"
          className="mt-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <LayoutGrid size={17} strokeWidth={2} className="text-neutral-400" />
          Все пространства
        </Link>
      </nav>

      <div className="border-t border-neutral-200 p-4">
        <div className="mb-2 truncate text-sm font-medium text-neutral-900">{user?.name}</div>
        <div className="mb-3 truncate text-xs text-neutral-400">{user?.email}</div>
        <Link
          href="/notifications"
          className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          <BellRing size={15} strokeWidth={2} className="text-neutral-400" />
          Telegram-оповещения
        </Link>
        {canEdit(user) && (
          <Link
            href="/questions"
            className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <MessageSquare size={15} strokeWidth={2} className="text-neutral-400" />
            Вопросы
          </Link>
        )}
        {user?.role === "ADMIN" && (
          <Link
            href="/admin/users"
            className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <Users size={15} strokeWidth={2} className="text-neutral-400" />
            Пользователи
          </Link>
        )}
        {user?.role === "ADMIN" && (
          <Link
            href="/admin/broadcast"
            className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <Send size={15} strokeWidth={2} className="text-neutral-400" />
            Рассылка в Telegram
          </Link>
        )}
        <LogoutButton />
      </div>
    </aside>
  );
}
