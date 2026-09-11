import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, ChevronRight, Trash2, History } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import ArticleWorkspace from "@/components/editor/ArticleWorkspace";
import FreshnessBadge from "@/components/FreshnessBadge";
import { getPageFreshness } from "@/lib/freshness/service";
import { recordPageView } from "@/lib/freshness/view";
import { deletePageAction } from "@/lib/pages/actions";
import { canEdit } from "@/lib/permissions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export default async function PageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const page = await prisma.page.findUnique({
    where: { id },
    include: { space: { select: { slug: true, name: true } } },
  });
  if (!page) notFound();

  const user = await getCurrentUser();
  const userCanEdit = canEdit(user);

  // Свежесть (кусок 4): считаем статус по состоянию ДО этого просмотра
  // (иначе автосигнал "давно не открывали" никогда бы не сработал), а сам
  // просмотр засчитываем сразу следом. Автора собственной статьи не
  // считаем "просмотром" — иначе автор, открывающий страницу, чтобы её
  // отредактировать, сам сбрасывает сигнал "давно не открывали" и маскирует
  // реальную нечитаемость статьи другими.
  const freshness = await getPageFreshness(page.id);
  if (user?.id !== page.authorId) {
    await recordPageView(page.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-6 md:px-8">
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-400">
          <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
            <Home size={14} />
          </Link>
          <ChevronRight size={13} />
          <Link href={`/spaces/${page.space.slug}`} className="hover:text-neutral-600">
            {page.space.name}
          </Link>
          <ChevronRight size={13} />
          <span className="truncate text-neutral-600">{page.title}</span>
        </div>

        {/* Без shrink-0 и с переносом: на 375px три элемента (История,
            статус свежести, Удалить) в одну строку не помещаются, и
            «Удалить» уезжала за правый край экрана. */}
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:gap-3">
          <Link
            href={`/pages/${page.id}/history`}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
          >
            <History size={15} />
            История
          </Link>
          {freshness && (
            <FreshnessBadge
              pageId={page.id}
              status={freshness.status}
              daysSinceReview={freshness.daysSinceReview}
              reviewIntervalDays={page.reviewIntervalDays}
              autoDowngraded={freshness.autoDowngraded}
              canEdit={userCanEdit}
            />
          )}
          {userCanEdit && (
            <form action={deletePageAction}>
              <input type="hidden" name="pageId" value={page.id} />
              <ConfirmSubmitButton
                confirmMessage={`Удалить статью «${page.title}»? Действие необратимо.`}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
                Удалить
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </div>

      <ArticleWorkspace
        pageId={page.id}
        initialTitle={page.title}
        initialContent={page.content}
        initialUpdatedAt={page.updatedAt.toISOString()}
        canEdit={userCanEdit}
      />
    </div>
  );
}
