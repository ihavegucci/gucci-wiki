import Link from "next/link";
import { Layers } from "lucide-react";

type CollectionSummary = {
  id: string;
  title: string;
  description: string | null;
  previews: { id: string; url: string }[];
  count: number;
};

// Обложка коллекции (A01 в plan.md) — наложенные превью первых файлов +
// счётчик бейджем, по мотивам "9" на assets/Файлы2.jpg.
export default function CollectionCard({ collection }: { collection: CollectionSummary }) {
  return (
    <Link
      href={`/files/collections/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="relative flex h-32 items-center justify-center bg-neutral-50">
        {collection.previews.length === 0 ? (
          <Layers size={28} className="text-neutral-300" />
        ) : (
          <div className="relative h-20 w-full">
            {collection.previews.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- превью произвольного файла в S3
              <img
                key={p.id}
                src={p.url}
                alt=""
                className="absolute top-0 h-20 w-20 rounded-lg border-2 border-white object-cover shadow-sm"
                style={{ left: `calc(50% - 40px + ${(i - (collection.previews.length - 1) / 2) * 28}px)` }}
              />
            ))}
          </div>
        )}
        <div className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs font-semibold text-white">
          {collection.count}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-neutral-900">{collection.title}</div>
        {collection.description && (
          <p className="mt-0.5 truncate text-xs text-neutral-400">{collection.description}</p>
        )}
      </div>
    </Link>
  );
}
