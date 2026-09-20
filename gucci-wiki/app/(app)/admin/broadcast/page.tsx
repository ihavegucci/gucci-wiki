import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import BroadcastForm from "@/app/(app)/admin/broadcast/BroadcastForm";

// Рассылка от админа всем, кто активировал Telegram-бота (R04/G09) — только
// Admin, как и другие /admin-страницы и /settings.
export default async function BroadcastPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <Send size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Рассылка в Telegram</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Сообщение придёт всем сотрудникам, которые активировали Telegram-бота в своём профиле.
      </p>

      <BroadcastForm />
    </div>
  );
}
