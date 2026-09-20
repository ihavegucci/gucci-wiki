import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, ChevronRight, Trash2 } from "lucide-react";
import { getCollection } from "@/lib/files/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import { deleteCollectionAction } from "@/lib/files/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import CollectionCarousel from "@/components/files/CollectionCarousel";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [collection, user] = await Promise.all([getCollection(id), getCurrentUser()]);
  if (!collection) notFound();

  const userCanEdit = canEdit(user);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-400">
          <Link href="/files" className="flex items-center gap-1.5 hover:text-neutral-600">
            <Home size={14} />
            Библиотека
          </Link>
          <ChevronRight size={13} />
          <Link href="/files/collections" className="hover:text-neutral-600">
            Коллекции
          </Link>
          <ChevronRight size={13} />
          <span className="text-neutral-600">{collection.title}</span>
        </div>

        {userCanEdit && (
          <form action={deleteCollectionAction}>
            <input type="hidden" name="collectionId" value={collection.id} />
            <ConfirmSubmitButton
              confirmMessage={`Удалить коллекцию «${collection.title}»? Сами файлы останутся в «Файлах».`}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={16} />
              Удалить коллекцию
            </ConfirmSubmitButton>
          </form>
        )}
      </div>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-neutral-900">{collection.title}</h1>
      {collection.description && <p className="mb-5 text-neutral-500">{collection.description}</p>}

      <div className="mt-6">
        <CollectionCarousel
          collectionId={collection.id}
          collectionTitle={collection.title}
          canEdit={userCanEdit}
          files={collection.items.map((item) => ({
            id: item.file.id,
            name: item.file.name,
            url: item.file.url,
            mimeType: item.file.mimeType,
            size: item.file.size,
          }))}
        />
      </div>
    </div>
  );
}
