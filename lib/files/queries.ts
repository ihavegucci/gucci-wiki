import { prisma } from "@/lib/db/prisma";

// Чтение — без проверки роли (R06: «Файлы» доступны на просмотр всем
// залогиненным, страница сама решает, кого пускать).

// Сколько папок и файлов показываем за раз. Список файлов растёт на каждой
// загрузке и никогда не чистится — до QA-прогона 4 он читался целиком на
// каждый рендер /files, то есть через год работы это тысячи строк на заход
// в раздел.
export const FILES_PAGE_SIZE = 48;

export async function getFolderContents(folderId: string | null, take: number = FILES_PAGE_SIZE) {
  const [folder, folders, files, totalFolders, totalFiles] = await Promise.all([
    folderId ? prisma.fileFolder.findUnique({ where: { id: folderId } }) : null,
    prisma.fileFolder.findMany({
      where: { parentId: folderId },
      orderBy: { name: "asc" },
      take,
    }),
    prisma.fileItem.findMany({
      where: { folderId },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.fileFolder.count({ where: { parentId: folderId } }),
    prisma.fileItem.count({ where: { folderId } }),
  ]);

  // Отдаём и полные количества: «показать ещё» без них пришлось бы гадать по
  // длине выборки, а пользователю негде увидеть, сколько всего в папке.
  return {
    folder,
    folders,
    files,
    totalFolders,
    totalFiles,
    hasMore: folders.length < totalFolders || files.length < totalFiles,
  };
}

// Глубина вложенности папок ничем не ограничена, а битая (циклическая)
// связь parentId сделала бы рекурсию бесконечной прямо в БД — потолок
// обязателен. 64 — заведомо больше любой осмысленной иерархии файлов.
const MAX_BREADCRUMB_DEPTH = 64;

// Хлебные крошки — цепочка родителей от корня до текущей папки, одним
// рекурсивным CTE. Раньше это был findUnique на каждого предка
// последовательно: на папке пятого уровня — пять round-trip'ов к Postgres
// на каждый рендер /files, и каждый тянул полную строку ради двух полей.
export async function getFolderBreadcrumbs(folderId: string | null): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];

  return prisma.$queryRaw<{ id: string; name: string }[]>`
    WITH RECURSIVE chain AS (
      SELECT f.id, f.name, f."parentId", 0 AS depth
      FROM "FileFolder" f
      WHERE f.id = ${folderId}
      UNION ALL
      SELECT p.id, p.name, p."parentId", chain.depth + 1
      FROM "FileFolder" p
      JOIN chain ON p.id = chain."parentId"
      WHERE chain.depth < ${MAX_BREADCRUMB_DEPTH}
    )
    SELECT chain.id, chain.name FROM chain ORDER BY chain.depth DESC
  `;
}

// Сколько коллекций показываем на главном экране «Файлы». Список растёт и
// никогда не чистится, а рендерится он каруселями — два десятка это уже
// предел читаемости экрана, дальше нужен отдельный просмотр.
const COLLECTIONS_ON_MAIN_SCREEN = 24;

// Потолок файлов внутри одной коллекции на этом экране. Совпадает с лимитом
// ZIP-архива (`MAX_ZIP_FILES` в app/api/files/download-zip): кнопка «скачать
// всё» в карусели всё равно не заберёт больше, так что показывать больше
// — значит обещать то, чего скачивание не сделает.
const FILES_PER_COLLECTION = 200;

// До QA-прогона 4 здесь не было ни одного `take`: каждый рендер /files тянул
// ВСЕ коллекции со ВСЕМИ их файлами целиком. Полноразмерная выборка осталась
// у getCollection ниже — там это отдельная страница одной коллекции, и она
// действительно должна показать всё.
export async function listCollections() {
  return prisma.fileCollection.findMany({
    orderBy: { createdAt: "desc" },
    take: COLLECTIONS_ON_MAIN_SCREEN,
    include: {
      items: { orderBy: { order: "asc" }, take: FILES_PER_COLLECTION, include: { file: true } },
    },
  });
}

export async function getCollection(collectionId: string) {
  return prisma.fileCollection.findUnique({
    where: { id: collectionId },
    include: { items: { orderBy: { order: "asc" }, include: { file: true } } },
  });
}
