import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSpaceIcon, getSpaceColorClasses } from "@/lib/spaces/icons";

function pluralArticles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "статья";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "статьи";
  return "статей";
}

export default function SpaceCard({
  slug,
  name,
  description,
  icon,
  color,
  pageCount,
}: {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  pageCount: number;
}) {
  const Icon = getSpaceIcon(icon);

  return (
    <Link
      href={`/spaces/${slug}`}
      className="group flex h-full items-start gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getSpaceColorClasses(color)}`}>
        {/* eslint-disable-next-line react-hooks/static-components -- Icon приходит из статической таблицы по ключу, ссылка стабильна */}
        <Icon size={19} strokeWidth={2} />
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="font-semibold text-neutral-900">{name}</div>
        {/* Слот под описание — фиксированная высота (min-h-10 = 2 строки text-sm),
            рендерится всегда, чтобы карточки без описания не были короче остальных. */}
        <p className="mt-1 min-h-10 line-clamp-2 text-sm text-neutral-500">{description ?? ""}</p>
        <div className="mt-auto pt-2 text-xs text-neutral-400">
          {pageCount} {pluralArticles(pageCount)}
        </div>
      </div>
      <ChevronRight
        size={18}
        className="mt-1 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-400"
      />
    </Link>
  );
}
