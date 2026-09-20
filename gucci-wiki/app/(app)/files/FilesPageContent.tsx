import Link from "next/link";
import { Home, ChevronRight, Layers } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import { getFolderContents, getFolderBreadcrumbs, listCollections, FILES_PAGE_SIZE } from "@/lib/files/queries";
import FileGrid from "@/components/files/FileGrid";
import FolderGrid from "@/components/files/FolderGrid";
import FileToolbar from "@/components/files/FileToolbar";
import CollectionCard from "@/components/files/CollectionCard";

// Общее тело для /files и /files/[folderId] — оба URL рендерят одну и ту
// же сетку, различается только folderId (см. app/(app)/files/page.tsx и
// app/(app)/files/[folderId]/page.tsx).
//
// Порядок секций — правка пользователя: сначала «Папки», под ними
// «Коллекции» (только на корне), затем «Файлы» — три отдельные подписанные
// секции, а не одна общая сетка вперемешку.
// Постраничность — тем же приёмом, что и на «Вопросах»: номер страницы в
// адресе, а не состояние в клиенте. Список остаётся серверным, ссылка
// «показать ещё» переживает перезагрузку и ею можно поделиться.
const MAX_PAGES = 50; // потолок против ?page=99999999 в адресной строке

export default async function FilesPageContent({
  folderId,
  page = 1,
}: {
  folderId: string | null;
  page?: number;
}) {
  const safePage = Math.min(Math.max(1, page), MAX_PAGES);
  const take = FILES_PAGE_SIZE * safePage;

  const [user, { folder, folders, files, totalFolders, totalFiles, hasMore }, breadcrumbs, collections] =
    await Promise.all([
      getCurrentUser(),
      getFolderContents(folderId, take),
      getFolderBreadcrumbs(folderId),
      listCollections(),
    ]);

  const userCanEdit = canEdit(user);
  const showCollections = !folder && collections.length > 0;
  const isEmpty = folders.length === 0 && files.length === 0 && !showCollections;

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-400">
          <Link href="/files" className="flex items-center gap-1.5 hover:text-neutral-600">
            <Home size={14} />
            Библиотека
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight size={13} />
              <Link href={`/files/${crumb.id}`} className="hover:text-neutral-600">
                {crumb.name}
              </Link>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/files/collections"
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <Layers size={16} />
            Коллекции
          </Link>
          {userCanEdit && <FileToolbar folderId={folder?.id ?? null} />}
        </div>
      </div>

      <h1 className="mb-5 text-2xl font-bold tracking-tight text-neutral-900">
        {folder ? folder.name : "Файлы"}
      </h1>

      {isEmpty && (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          Здесь пока пусто.
        </div>
      )}

      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">
            Папки
            {totalFolders > folders.length && (
              <span className="ml-2 text-sm font-normal text-neutral-400">
                показаны {folders.length} из {totalFolders}
              </span>
            )}
          </h2>
          <FolderGrid folders={folders} canEdit={userCanEdit} />
        </section>
      )}

      {/* Коллекции — только на корневом экране «Файлы» (R03), отображаются
          как папки файлов той же карточкой, что и на отдельной странице
          /files/collections (см. CollectionCard). */}
      {showCollections && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Коллекции</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {collections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={{
                  id: collection.id,
                  title: collection.title,
                  description: collection.description,
                  count: collection.items.length,
                  previews: collection.items
                    .filter((item) => item.file.mimeType.startsWith("image/"))
                    .slice(0, 3)
                    .map((item) => ({ id: item.file.id, url: item.file.url })),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {files.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">
            Файлы
            {totalFiles > files.length && (
              <span className="ml-2 text-sm font-normal text-neutral-400">
                показаны {files.length} из {totalFiles}
              </span>
            )}
          </h2>
          <FileGrid
            files={files}
            canEdit={userCanEdit}
            collections={collections.map((c) => ({ id: c.id, title: c.title }))}
            zipName={folder ? folder.name : "Файлы"}
          />
        </section>
      )}

      {hasMore && safePage < MAX_PAGES && (
        <div className="mt-6 text-center">
          <Link
            href={`${folder ? `/files/${folder.id}` : "/files"}?page=${safePage + 1}`}
            className="inline-block rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Показать ещё
          </Link>
        </div>
      )}
    </div>
  );
}
