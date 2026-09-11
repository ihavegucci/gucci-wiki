import { Home as HomeIcon, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import SpaceCard from "@/components/spaces/SpaceCard";
import { getSpaceIcon, getSpaceColorClasses } from "@/lib/spaces/icons";
import AskQuestionButton from "@/components/questions/AskQuestionButton";
import { getSettings } from "@/lib/settings/settings";
import { FadeIn, HoverLift } from "./motion";

// Черновик ≠ публикация (см. lib/pages/actions.ts) — пустые заглушки нигде
// на главной не должны считаться статьями. Нашла слепая проверка (G3):
// раньше они попадали в счётчик статей пространства и в ленту изменений.
// С QA-прогона 4 это индексируемая колонка, а не сравнение всего HTML со
// строкой-заглушкой.
const PUBLISHED = { published: true } as const;

const TOC = [
  "О чём эта вики",
  "Как найти нужное",
  "Кто может редактировать",
  "Правила и принципы",
  "Связаться с нами",
];

// Плоский текст статьи (lib/search сохраняет searchText без HTML,
// абзацы через \n) — берём первые слова как краткое описание карточки.
function excerpt(searchText: string, max = 90): string {
  const flat = searchText.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

function timeAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return `${Math.floor(days / 30)} мес. назад`;
}

export default async function HomePage() {
  const [spaces, popularPages, recentPages, settings] = await Promise.all([
    prisma.space.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { pages: { where: PUBLISHED } } } },
    }),
    prisma.page.findMany({
      where: { viewCount: { gt: 0 }, ...PUBLISHED },
      orderBy: { viewCount: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        searchText: true,
        space: { select: { name: true, icon: true, color: true } },
      },
    }),
    prisma.page.findMany({
      where: PUBLISHED,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    }),
    getSettings(),
  ]);

  return (
    <div className="flex">
      <div className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
          <HomeIcon size={14} />
          <ChevronRight size={13} />
          <span className="text-neutral-600">Главная</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
              Добро пожаловать в gucci-wiki
            </h1>
            <p className="mt-2 text-neutral-500">
              Единое место для хранения знаний, инструкций и лучших практик нашей компании.
            </p>
          </div>
          {/* Логотип компании (R19) — небольшой, справа от приветствия,
              только если загружен в /settings. Размер и выравнивание по
              центру текста — правка пользователя после первого прогона:
              был слишком крупный (168px) с items-start, из-за чего верхним
              краем задавал высоту всего блока и сдвигал секции ниже вниз.
              Скрыт до md (не sm) — единая точка перелома мобильный/десктоп
              для всего фронтенда (см. .gucci/plan.md). */}
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- превью произвольного внешнего URL из S3, next/image тут не нужен
            <img
              src={settings.logoUrl}
              alt="Логотип компании"
              className="hidden h-[118px] w-[118px] shrink-0 object-contain md:block"
            />
          )}
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Популярные статьи</h2>
          {popularPages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-8 text-center text-sm text-neutral-400">
              Здесь появятся самые популярные статьи, как только они будут написаны.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              {popularPages.map((page, i) => {
                const Icon = getSpaceIcon(page.space.icon);
                return (
                  <FadeIn key={page.id} delay={i * 0.05} className="h-full">
                    <HoverLift className="h-full">
                      <Link
                        href={`/pages/${page.id}`}
                        className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 hover:shadow-sm"
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${getSpaceColorClasses(page.space.color)}`}>
                          <Icon size={17} strokeWidth={2} />
                        </div>
                        <div className="mt-3 font-semibold text-neutral-900">{page.title}</div>
                        {/* Слот под выдержку — фиксированная высота (min-h-10 = 2 строки
                            text-sm), рендерится всегда, чтобы карточки без выдержки не были короче. */}
                        <p className="mt-1 min-h-10 line-clamp-2 text-sm text-neutral-500">{excerpt(page.searchText)}</p>
                        <div className="mt-auto pt-3 text-xs text-neutral-400">{page.space.name}</div>
                      </Link>
                    </HoverLift>
                  </FadeIn>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Пространства</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {spaces.map((space, i) => (
              <FadeIn key={space.id} delay={i * 0.04} className="h-full">
                <HoverLift className="h-full">
                  <SpaceCard
                    slug={space.slug}
                    name={space.name}
                    description={space.description}
                    icon={space.icon}
                    color={space.color}
                    pageCount={space._count.pages}
                  />
                </HoverLift>
              </FadeIn>
            ))}
          </div>
        </section>
      </div>

      <aside className="hidden w-72 shrink-0 border-l border-neutral-200 px-5 py-6 xl:block">
        <div className="text-xs font-semibold tracking-wide text-neutral-400">СОДЕРЖАНИЕ СТРАНИЦЫ</div>
        <ul className="mt-3 space-y-2.5 border-l border-neutral-200 pl-3 text-sm">
          {TOC.map((item, i) => (
            <li key={item} className={i === 0 ? "-ml-3 border-l-2 border-indigo-600 pl-3 font-medium text-indigo-700" : "text-neutral-500"}>
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-medium text-neutral-900">Не нашли ответ?</div>
          <p className="mt-1 text-xs text-neutral-500">Оставьте запрос, и мы дополним базу знаний.</p>
          <AskQuestionButton />
        </div>

        <div className="mt-8 text-xs font-semibold tracking-wide text-neutral-400">ПОСЛЕДНИЕ ИЗМЕНЕНИЯ</div>
        {recentPages.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-400">
            Пока нет изменений — они появятся здесь, как только кто-то отредактирует статью.
          </div>
        ) : (
          <ul className="mt-3 space-y-3.5">
            {recentPages.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.id}`} className="flex items-start gap-2 group">
                  <Pencil size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-700 group-hover:text-indigo-700">
                      {page.title}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {page.author?.name ?? "Без автора"} · {timeAgo(page.updatedAt)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
