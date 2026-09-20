import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import NewSpaceForm from "./NewSpaceForm";

export default async function NewSpacePage() {
  // Подстраховка для рендера — реальная проверка в createSpaceAction.
  // Без нее Viewer, зашедший по прямой ссылке, видел бы форму и получал
  // необработанное исключение вместо понятного редиректа.
  const user = await getCurrentUser();
  if (!canEdit(user)) redirect("/spaces");

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <Link href="/spaces" className="hover:text-neutral-600">
          Пространства
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">Новое</span>
      </div>

      <h1 className="mb-6 text-2xl font-bold tracking-tight text-neutral-900">Новое пространство</h1>

      <NewSpaceForm />
    </div>
  );
}
