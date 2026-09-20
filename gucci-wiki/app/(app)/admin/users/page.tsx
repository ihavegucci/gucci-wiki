import { redirect } from "next/navigation";
import { Users as UsersIcon } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import UserActions, { UserStatusBadge, ROLE_LABELS } from "@/components/admin/UserActions";

// Управление пользователями (кусок 2, R01/R02/R03/R06) — только Admin, как
// и /settings, /admin/broadcast: редирект на / для всех остальных.
export default async function AdminUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });

  const dateOf = (d: Date) => d.toLocaleDateString("ru-RU");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <UsersIcon size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Пользователи</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Подтверждение заявок на регистрацию, назначение ролей, удаление пользователей.
      </p>

      {users.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          Пользователей пока нет
        </div>
      )}

      {/* Таблица — только от md. Ниже 768px она шире экрана, и колонка с
          действиями (роль, удаление) оказывалась за правым краем: формально
          доскроллить можно, практически — управлять правами с телефона было
          нельзя. Это осознанное исключение из общего правила проекта
          «широкие таблицы на мобильном — overflow-x-auto, не карточки»:
          правило писалось про таблицы с данными, а здесь в колонке живут
          органы управления. Разметка действий общая (UserActions), так что
          два представления не могут разъехаться. */}
      {users.length > 0 && (
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-3">Пользователь</th>
                  <th className="px-4 py-3">Регистрация</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Роль</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{u.name}</div>
                      <div className="text-neutral-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{dateOf(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "PENDING" ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <span className="text-neutral-700">{ROLE_LABELS[u.role]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <UserActions user={u} isSelf={u.id === currentUser.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Карточки — до md. Те же действия, но в столбик и во всю ширину. */}
      <ul className="mt-6 space-y-3 md:hidden">
        {users.map((u) => (
          <li key={u.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-900">{u.name}</div>
              <div className="truncate text-sm text-neutral-400">{u.email}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <UserStatusBadge status={u.status} />
              {u.status !== "PENDING" && (
                <span className="text-neutral-600">Роль: {ROLE_LABELS[u.role]}</span>
              )}
              <span>· с {dateOf(u.createdAt)}</span>
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <UserActions user={u} isSelf={u.id === currentUser.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
