import Link from "next/link";
import { Home, ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import SpaceCard from "@/components/spaces/SpaceCard";

export default async function SpacesIndexPage() {
  const [spaces, user] = await Promise.all([
    prisma.space.findMany({
      orderBy: { createdAt: "asc" },
      // Пустые заглушки ("Новая статья" без содержимого) не в счёт — та же
      // логика, что и на странице самого пространства (app/(app)/spaces/[slug]/page.tsx),
      // иначе карточка показывает число, которое не совпадает со списком статей внутри.
      include: { _count: { select: { pages: { where: { published: true } } } } },
    }),
    getCurrentUser(),
  ]);
  const userCanEdit = canEdit(user);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">Пространства</span>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Пространства</h1>
        {userCanEdit && (
          <Link
            href="/spaces/new"
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            <Plus size={16} />
            Создать пространство
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {spaces.map((space) => (
          <SpaceCard
            key={space.id}
            slug={space.slug}
            name={space.name}
            description={space.description}
            icon={space.icon}
            color={space.color}
            pageCount={space._count.pages}
          />
        ))}
      </div>
    </div>
  );
}
