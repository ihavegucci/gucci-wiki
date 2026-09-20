import { Trash2 } from "lucide-react";
import { approveUserAction, changeUserRoleAction, deleteUserAction } from "@/lib/users/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Select from "@/components/ui/Select";

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function UserStatusBadge({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Ожидает подтверждения
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Активен
    </span>
  );
}

// Действия над пользователем — подтверждение заявки либо смена роли и
// удаление. Вынесены отдельным компонентом, потому что рисуются дважды: в
// таблице на десктопе и в карточке на мобильном (см. app/(app)/admin/users).
// Две копии этих форм разъехались бы при первой же правке прав.
export default function UserActions({
  user,
  isSelf,
}: {
  user: { id: string; name: string; status: string; role: string };
  isSelf: boolean;
}) {
  if (user.status === "PENDING") {
    return (
      <form action={approveUserAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={user.id} />
        <Select
          name="role"
          defaultValue="VIEWER"
          className="w-28"
          options={[
            { value: "VIEWER", label: ROLE_LABELS.VIEWER },
            { value: "EDITOR", label: ROLE_LABELS.EDITOR },
          ]}
        />
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Подтвердить
        </button>
      </form>
    );
  }

  if (isSelf) {
    return <span className="text-sm text-neutral-400">Это вы</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={changeUserRoleAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={user.id} />
        <Select
          name="role"
          defaultValue={user.role}
          className="w-28"
          options={[
            { value: "ADMIN", label: ROLE_LABELS.ADMIN },
            { value: "EDITOR", label: ROLE_LABELS.EDITOR },
            { value: "VIEWER", label: ROLE_LABELS.VIEWER },
          ]}
        />
        <button
          type="submit"
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Сохранить
        </button>
      </form>
      <form action={deleteUserAction}>
        <input type="hidden" name="userId" value={user.id} />
        <ConfirmSubmitButton
          confirmMessage={`Удалить пользователя «${user.name}»? Это действие необратимо.`}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
          <span className="md:hidden">Удалить</span>
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
