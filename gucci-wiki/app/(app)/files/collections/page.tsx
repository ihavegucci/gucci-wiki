import Link from "next/link";
import { Home, ChevronRight, Folder } from "lucide-react";
import { listCollections } from "@/lib/files/queries";
import CollectionCard from "@/components/files/CollectionCard";

export default async function CollectionsPage() {
  const collections = await listCollections();

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-400">
          <Link href="/files" className="flex items-center gap-1.5 hover:text-neutral-600">
            <Home size={14} />
            Библиотека
          </Link>
          <ChevronRight size={13} />
          <span className="text-neutral-600">Коллекции</span>
        </div>
        <Link
          href="/files"
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <Folder size={16} />
          К файлам
        </Link>
      </div>

      <h1 className="mb-5 text-2xl font-bold tracking-tight text-neutral-900">Коллекции</h1>

      {collections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          Коллекций пока нет — выделите файлы в «Файлах» и добавьте их в новую коллекцию.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
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
      )}
    </div>
  );
}
