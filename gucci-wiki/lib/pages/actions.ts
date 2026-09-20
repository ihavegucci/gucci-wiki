"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { slugify, createWithUniqueSlug } from "@/lib/slug";
import { notifyPagePublished } from "@/lib/telegram/broadcast";
import { currentOrigin } from "@/lib/telegram/origin";
import { assertCanEdit } from "@/lib/permissions";
import { EMPTY_CONTENT } from "@/lib/pages/constants";

async function requireEditor() {
  const user = await getCurrentUser();
  assertCanEdit(user);
  return user;
}

// Создаёт пустую статью и сразу открывает её в редакторе — название и
// содержимое дописываются на месте, отдельная форма "новой статьи" не нужна.
export async function createPageAction(formData: FormData) {
  const user = await requireEditor();
  const spaceSlug = String(formData.get("spaceSlug") ?? "");

  const space = await prisma.space.findUnique({ where: { slug: spaceSlug } });
  if (!space) notFound();

  const title = "Новая статья";
  const page = await createWithUniqueSlug(
    slugify(title),
    (candidate) =>
      prisma.page
        .findUnique({ where: { spaceId_slug: { spaceId: space.id, slug: candidate } } })
        .then(Boolean),
    (slug) =>
      prisma.page.create({
        data: {
          title,
          slug,
          content: EMPTY_CONTENT,
          spaceId: space.id,
          authorId: user.id,
        },
      })
  );

  // Telegram (кусок 7, G09) уведомляет не здесь — здесь создаётся ещё
  // пустой черновик-заглушка «Новая статья», а не публикация. Момент
  // "публикации" — первое сохранение с реальным содержимым, см.
  // updatePageAction ниже (D02 в plan.md).

  revalidatePath(`/spaces/${spaceSlug}`);
  redirect(`/pages/${page.id}`);
}

// `updatedAt` возвращается на клиент и подставляется в следующее сохранение:
// без этого вторая правка подряд из той же открытой вкладки конфликтовала бы
// сама с собой. `conflict` отличает «кто-то успел раньше» от обычной ошибки
// валидации — редактор по нему показывает другое сообщение и предлагает
// сохранить поверх.
export type UpdatePageState =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string; conflict?: boolean }
  | null;

// Сколько версий держим на статью. Каждая версия — полная копия HTML, так
// что без потолка активно правимая статья на 80 КБ за год работы разложит в
// БД сотни мегабайт. 20 снимков покрывают реальный сценарий восстановления
// («вчера кто-то затёр абзац»), не превращая таблицу в свалку.
const PAGE_VERSIONS_KEPT = 20;

// Снимок ПРЕДЫДУЩЕГО содержимого перед перезаписью — именно он позволяет
// восстановить затёртое. Пишется в той же транзакции, что и сам update:
// иначе падение между двумя запросами оставит статью перезаписанной, а
// историю — без записи, то есть ровно в том состоянии, от которого версии
// и должны защищать. Заглушку пустой статьи не версионируем — восстанавливать
// в ней нечего.
//
// Содержимое читается ЗДЕСЬ ЖЕ, внутри транзакции, и сразу под `FOR UPDATE`,
// а не передаётся аргументом из вызывающего кода. Иначе между чтением
// снаружи и записью успевает вклиниться чужое сохранение, и в историю
// уходит не то содержимое, которое мы реально затёрли — то есть версия
// существует, но восстанавливать по ней нечего (нашла слепая приёмка).
// Блокировка строки заодно выстраивает одновременные сохранения одной
// статьи в очередь, что для этой операции и требуется.
// Ещё одна работа этой же блокировки — проверка «содержимое не изменилось с
// тех пор, как редактор его загрузил» (QA-прогон 4). Сравнение и запись
// обязаны быть под одним и тем же локом: проверь снаружи — и между проверкой
// и записью успеет вклиниться чужое сохранение, то есть защита от затирания
// сама окажется гонкой.
//
// `expectedUpdatedAt === null` означает осознанную перезапись: откат к версии
// и повторное «сохранить поверх» после показанного конфликта. Затираемое
// содержимое при этом всё равно уходит в историю.
type SaveResult =
  | { ok: true; updatedAt: Date; isFirstPublish: boolean }
  | { ok: false; reason: "conflict" | "missing" };

async function savePageWithVersion(
  pageId: string,
  authorId: string,
  data: { title: string; content: string },
  expectedUpdatedAt: Date | null
): Promise<SaveResult> {
  return prisma.$transaction(async (tx): Promise<SaveResult> => {
    const [locked] = await tx.$queryRaw<{ content: string; updatedAt: Date }[]>`
      SELECT content, "updatedAt" FROM "Page" WHERE id = ${pageId} FOR UPDATE
    `;
    if (!locked) return { ok: false, reason: "missing" };

    if (expectedUpdatedAt && locked.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { ok: false, reason: "conflict" };
    }

    // «Первая публикация» решается здесь же, под локом: два параллельных
    // первых сохранения (двойной клик, две вкладки) иначе оба увидели бы
    // пустую заглушку и оба разослали бы уведомление в Telegram.
    const previousContent = locked.content;
    const isFirstPublish = previousContent === EMPTY_CONTENT && data.content !== EMPTY_CONTENT;

    const updated = await tx.page.update({
      where: { id: pageId },
      // published — та же величина, что раньше вычислялась сравнением всего
      // HTML при каждом чтении списка статей; теперь считается один раз при
      // записи. Возврат статьи к пустой заглушке снимает флаг обратно.
      data: { ...data, published: data.content !== EMPTY_CONTENT },
    });

    if (previousContent !== EMPTY_CONTENT && previousContent !== data.content) {
      await tx.pageVersion.create({ data: { pageId, content: previousContent, authorId } });

      const stale = await tx.pageVersion.findMany({
        where: { pageId },
        orderBy: { createdAt: "desc" },
        skip: PAGE_VERSIONS_KEPT,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.pageVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
      }
    }

    return { ok: true, updatedAt: updated.updatedAt, isFirstPublish };
  });
}

export async function updatePageAction(
  _prev: UpdatePageState,
  formData: FormData
): Promise<UpdatePageState> {
  const editor = await requireEditor();

  const pageId = String(formData.get("pageId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "") || EMPTY_CONTENT;

  if (!title) return { ok: false, error: "Заголовок не может быть пустым." };

  // Метка версии, которую редактор загружал. Пустая или отсутствующая
  // означает «сохранить поверх» — так приходит повторное нажатие уже после
  // показанного конфликта.
  const rawBase = String(formData.get("baseUpdatedAt") ?? "");
  const parsedBase = rawBase ? new Date(rawBase) : null;
  const expectedUpdatedAt = parsedBase && !Number.isNaN(parsedBase.getTime()) ? parsedBase : null;

  const page = await prisma.page.findUnique({ where: { id: pageId }, include: { space: true } });
  if (!page) return { ok: false, error: "Статья не найдена." };

  const result = await savePageWithVersion(pageId, editor.id, { title, content }, expectedUpdatedAt);

  if (!result.ok) {
    if (result.reason === "missing") return { ok: false, error: "Статья не найдена." };
    return {
      ok: false,
      conflict: true,
      error:
        "Статью изменил кто-то другой, пока вы её редактировали. Ваш текст никуда не делся — " +
        "он остался в редакторе. Откройте историю версий, чтобы посмотреть чужую правку, " +
        "или нажмите «Сохранить поверх», чтобы записать свой вариант (предыдущий уйдёт в историю).",
    };
  }

  const isFirstPublish = result.isFirstPublish;

  if (isFirstPublish) {
    // Telegram (кусок 7, G09): факт публикации новой статьи — всем, кто
    // активировал бота. Публикация = первое сохранение с реальным
    // содержимым (страница создавалась пустой заглушкой). Не await — не
    // задерживаем ответ автору рассылкой; ошибки Telegram не должны
    // ронять сохранение статьи.
    const origin = await currentOrigin();
    notifyPagePublished({
      title,
      spaceName: page.space.name,
      url: origin ? `${origin}/pages/${page.id}` : `/pages/${page.id}`,
    }).catch(() => {});
  }

  revalidatePath(`/pages/${pageId}`);
  return { ok: true, updatedAt: result.updatedAt.toISOString() };
}

// Откат к сохранённой версии. Сам по себе он тоже перезапись, поэтому идёт
// тем же путём, что и обычное сохранение: текущее содержимое уходит в
// историю, и отменить неудачный откат можно тем же откатом. Метка версии не
// проверяется — пользователь уже видел список версий и выбрал осознанно.
export async function restorePageVersionAction(formData: FormData) {
  const editor = await requireEditor();

  const versionId = String(formData.get("versionId") ?? "");
  const version = await prisma.pageVersion.findUnique({
    where: { id: versionId },
    select: { pageId: true, content: true },
  });
  if (!version) throw new Error("Версия не найдена — возможно, её вытеснили более новые.");

  const page = await prisma.page.findUnique({
    where: { id: version.pageId },
    select: { title: true },
  });
  if (!page) throw new Error("Статья не найдена.");

  // Заголовок в версиях не хранится (модель PageVersion содержит только
  // содержимое) — откат меняет текст статьи, оставляя текущее название.
  const result = await savePageWithVersion(
    version.pageId,
    editor.id,
    { title: page.title, content: version.content },
    null
  );
  if (!result.ok) throw new Error("Не удалось восстановить версию.");

  revalidatePath(`/pages/${version.pageId}`);
  revalidatePath(`/pages/${version.pageId}/history`);
  redirect(`/pages/${version.pageId}`);
}

export async function deletePageAction(formData: FormData) {
  await requireEditor();

  const pageId = String(formData.get("pageId") ?? "");
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { space: { select: { slug: true } } },
  });
  if (!page) notFound();

  await prisma.page.delete({ where: { id: pageId } });

  revalidatePath(`/spaces/${page.space.slug}`);
  redirect(`/spaces/${page.space.slug}`);
}
