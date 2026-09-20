"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCanEdit } from "@/lib/permissions";
import { deleteObjects } from "@/lib/storage/s3";

// Запись — только canEdit (R07). Чтение живёт отдельно в lib/files/queries.ts.

const UNSORTED_FOLDER_NAME = "Нераспределённое";

// Папка для файлов без явного места (кусок 6, R09) — общая системная папка
// в корне, а не привязанная к конкретному пользователю (authorId: null).
// Ищем/создаём лениво: первый прямой аплоад из статьи создаёт её, все
// следующие — переиспользуют.
export async function getOrCreateUnsortedFolder(): Promise<string> {
  const existing = await prisma.fileFolder.findFirst({
    where: { name: UNSORTED_FOLDER_NAME, parentId: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  // find+create не атомарны: два одновременных первых аплоада могут оба
  // пройти проверку выше до того, как любой запишется. БД теперь защищена
  // частичным уникальным индексом (миграция chunk5_schema_audit) — проигравший
  // запрос падает на P2002, и в этом случае просто читаем то, что создал
  // победитель, вместо необработанной 500 (тот же паттерн, что createWithUniqueSlug).
  try {
    const created = await prisma.fileFolder.create({
      data: { name: UNSORTED_FOLDER_NAME, parentId: null, authorId: null },
    });
    return created.id;
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err;
    const winner = await prisma.fileFolder.findFirstOrThrow({
      where: { name: UNSORTED_FOLDER_NAME, parentId: null },
      select: { id: true },
    });
    return winner.id;
  }
}

// Потолок на пользовательские строки: в схеме это TEXT без ограничения, и
// без проверки здесь прямой POST кладёт в БД строку любой длины (она потом
// попадёт и в суточный дамп, и в список папок на экране).
const NAME_MAX_LENGTH = 120;

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

export async function createFolderAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const name = String(formData.get("name") ?? "").trim().slice(0, NAME_MAX_LENGTH);
  if (!name) throw new Error("Название папки обязательно.");
  const parentId = String(formData.get("parentId") ?? "") || null;

  // Родитель мог быть удалён в другой вкладке: без этой проверки Prisma
  // роняет P2003 (нарушение внешнего ключа) необработанным исключением, и
  // пользователь вместо объяснения видит общий экран ошибки.
  if (parentId) {
    const parent = await prisma.fileFolder.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) throw new Error("Папка, в которую вы добавляете, больше не существует.");
  }

  // Частичный уникальный индекс на корневые папки (миграция
  // chunk5_schema_audit) заводился ради гонки на «Нераспределённом», но
  // действует на любые корневые папки — две одноимённые в корне запрещены.
  // Без этого catch вторая «Договоры» роняла server action необработанным
  // P2002 и весь экран уходил в ошибку Next.js.
  try {
    await prisma.fileFolder.create({
      data: { name, parentId, authorId: user.id },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("Папка с таким названием здесь уже есть.");
    throw err;
  }

  revalidatePath("/files");
}

export type RenameFolderState = { ok: true } | { ok: false; error: string } | null;

// Возвращает состояние, а не бросает исключение: самая частая неудача здесь —
// «папка с таким именем уже есть», и это нормальный ответ формы, а не сбой.
// Брошенное исключение из server action заменяет весь экран страницей ошибки,
// что для опечатки в названии — несоразмерно.
export async function renameFolderAction(
  _prev: RenameFolderState,
  formData: FormData
): Promise<RenameFolderState> {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const folderId = String(formData.get("folderId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, NAME_MAX_LENGTH);
  if (!name) return { ok: false, error: "Название папки обязательно." };

  // updateMany вместо update: папки может уже не быть (удалена в другой
  // вкладке), а update в этом случае бросает P2025 — необработанная 500
  // вместо понятного текста.
  let renamed;
  try {
    renamed = await prisma.fileFolder.updateMany({ where: { id: folderId }, data: { name } });
  } catch (err) {
    // Частичный уникальный индекс на корневые папки (см. комментарий в
    // createFolderAction) запрещает две одноимённые папки в корне.
    if (isUniqueViolation(err)) return { ok: false, error: "Папка с таким названием здесь уже есть." };
    throw err;
  }
  if (renamed.count === 0) return { ok: false, error: "Папка больше не существует." };

  revalidatePath("/files");
  return { ok: true };
}

// Собирает все FileItem во всём поддереве папки (сама папка + все вложенные
// на любую глубину) — нужно, чтобы почистить их объекты в S3 после того, как
// каскад Prisma удалит записи в БД.
//
// Обход идёт уровнями (`parentId: { in: [...] }`), а не по одной папке за
// запрос: на дереве из 60 подпапок прежний вариант делал 61 обращение к БД
// подряд ещё до начала удаления.
async function collectFilesInSubtree(rootFolderId: string) {
  const folderIds = [rootFolderId];
  let level = [rootFolderId];
  while (level.length > 0) {
    const children = await prisma.fileFolder.findMany({
      where: { parentId: { in: level } },
      select: { id: true },
    });
    level = children.map((c) => c.id);
    folderIds.push(...level);
  }
  return prisma.fileItem.findMany({
    where: { folderId: { in: folderIds } },
    select: { key: true },
  });
}

// Порядок «сначала БД, потом S3» важен и выбран осознанно (QA-прогон 3).
// Раньше сначала чистились объекты в бакете, и обрыв на середине (таймаут,
// рестарт контейнера, деплой) оставлял записи в БД без байтов: файлы видны
// в «Файлах», но скачивание отдаёт 502, а из ZIP они молча выпадают, и
// повторное удаление уже ничего не чинит. При обратном порядке худший
// случай — осиротевший объект в бакете, а это уже принятый в CLAUDE.md
// компромисс (S3 и Postgres не в одной транзакции).
export async function deleteFolderAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const folderId = String(formData.get("folderId") ?? "");
  // Ключи собираем до удаления — после каскада читать будет нечего.
  const files = await collectFilesInSubtree(folderId);

  // onDelete: Cascade в schema.prisma убирает вложенные папки, файлы и их
  // FileCollectionItem автоматически. deleteMany вместо delete: папки может
  // уже не быть, и это не повод показывать экран ошибки.
  const removed = await prisma.fileFolder.deleteMany({ where: { id: folderId } });
  revalidatePath("/files");
  if (removed.count === 0) return;

  await deleteObjectsBestEffort(files.map((f) => f.key));
}

export async function deleteFileAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const fileId = String(formData.get("fileId") ?? "");
  const file = await prisma.fileItem.findUnique({ where: { id: fileId }, select: { key: true } });
  if (!file) return;

  // onDelete: Cascade убирает FileCollectionItem этого файла — не
  // остаётся сиротой ни в одной коллекции.
  const removed = await prisma.fileItem.deleteMany({ where: { id: fileId } });
  revalidatePath("/files");
  if (removed.count === 0) return;

  await deleteObjectsBestEffort([file.key]);
}

// Удаление S3-объектов — best-effort (D01 в plan.md): ошибка не откатывает
// уже удалённые записи в БД, объекты и Postgres не в одной транзакции. Но
// она обязана быть видна в логах, иначе объект осиротеет незаметно.
//
// Пакетным запросом, а не циклом по одному ключу (QA-прогон 4): раньше
// каждая итерация заново читала настройки и конструировала свой S3-клиент,
// так что удаление папки с 300 файлами означало 300 клиентов подряд.
async function deleteObjectsBestEffort(keys: string[]) {
  const result = await deleteObjects(keys);
  if (!result.ok) {
    console.error("Не удалось удалить объекты S3:", result.error);
    return;
  }
  for (const failure of result.failed) {
    console.error(`Не удалось удалить объект S3 (key=${failure.key}):`, failure.error);
  }
}

export async function createCollectionAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const title = String(formData.get("title") ?? "").trim().slice(0, NAME_MAX_LENGTH);
  if (!title) throw new Error("Название коллекции обязательно.");
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);

  const collection = await prisma.fileCollection.create({
    data: { title, description: description || null, authorId: user.id },
  });

  revalidatePath("/files/collections");
  return collection;
}

export async function deleteCollectionAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const collectionId = String(formData.get("collectionId") ?? "");
  // deleteMany: коллекции может уже не быть (удалена в другой вкладке) —
  // delete в этом случае бросает P2025 и роняет страницу.
  await prisma.fileCollection.deleteMany({ where: { id: collectionId } });

  revalidatePath("/files/collections");
}

// Добавляет файлы в коллекцию — физически файл не копируется, только
// ссылка в FileCollectionItem (см. plan.md).
export async function addFilesToCollectionAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const collectionId = String(formData.get("collectionId") ?? "");
  const fileIds = formData.getAll("fileIds").map(String).filter(Boolean);
  if (fileIds.length === 0) return;

  // max(order) + чтение внутри той же транзакции, что и запись. count() был
  // неверен дважды: после удаления элемента он даёт уже занятое значение, а
  // чтение вне транзакции позволяло двум редакторам получить один и тот же
  // «следующий» порядок и слепить элементы в коллекции.
  await prisma.$transaction(async (tx) => {
    const last = await tx.fileCollectionItem.findFirst({
      where: { collectionId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    await tx.fileCollectionItem.createMany({
      data: fileIds.map((fileId, i) => ({ collectionId, fileId, order: nextOrder + i })),
      skipDuplicates: true,
    });
  });

  revalidatePath("/files/collections");
}

export async function removeFileFromCollectionAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const collectionId = String(formData.get("collectionId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  // deleteMany вместо delete — элемента может уже не быть, а P2025 здесь
  // означал бы экран ошибки на ровном месте.
  await prisma.fileCollectionItem.deleteMany({ where: { collectionId, fileId } });

  revalidatePath("/files/collections");
}
