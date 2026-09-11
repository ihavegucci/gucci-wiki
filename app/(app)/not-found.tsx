import Link from "next/link";
import { FileQuestion } from "lucide-react";

// notFound() зовут страницы пространства, статьи, папки, коллекции и карты
// процессов — все внутри этой группы, поэтому одного файла на группу хватает.
export default function AppNotFound() {
  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <FileQuestion size={20} />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-neutral-900">Страница не найдена</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Возможно, её удалили или ссылка устарела.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
