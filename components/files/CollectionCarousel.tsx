"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, DownloadCloud } from "lucide-react";
import { removeFileFromCollectionAction } from "@/lib/files/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { formatSize, isImage, getFileIcon, downloadUrl, downloadAll } from "./utils";

type CarouselFile = { id: string; name: string; url: string; mimeType: string; size: number };

// Карусель коллекции (R13) — голый useState, без сторонней библиотеки
// (см. plan.md: «BLOCKED, не ставь сам» — тут это буквально несколько строк).
export default function CollectionCarousel({
  collectionId,
  collectionTitle,
  files,
  canEdit,
}: {
  collectionId: string;
  collectionTitle: string;
  files: CarouselFile[];
  canEdit: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = files[Math.min(index, files.length - 1)];
  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
        В коллекции больше нет файлов.
      </div>
    );
  }

  // getFileIcon возвращает один из нескольких фиксированных компонентов
  // lucide-react — идентичность стабильна между рендерами, это не "создание
  // компонента во время рендера", просто выбор из готового набора.
  const Icon = getFileIcon(current.mimeType);
  const go = (delta: number) => setIndex((i) => (i + delta + files.length) % files.length);

  return (
    <div className="flex flex-col items-center">
      {files.length > 1 && (
        <div className="mb-3 flex w-full max-w-xl justify-end">
          <button
            type="button"
            onClick={() => downloadAll(files.map((f) => f.id), collectionTitle)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <DownloadCloud size={15} />
            Скачать всё
          </button>
        </div>
      )}
      <div className="relative flex w-full max-w-xl items-center justify-center gap-3">
        {files.length > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Предыдущий файл"
            title="Предыдущий файл"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        <div className="flex h-64 w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 md:h-80">
          {isImage(current.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element -- превью произвольного файла в S3
            <img src={current.url} alt={current.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              {/* eslint-disable-next-line react-hooks/static-components -- Icon выбран из фиксированного набора lucide-иконок getFileIcon(), идентичность стабильна между рендерами */}
              <Icon size={48} strokeWidth={1.5} />
              <div className="text-sm font-medium text-neutral-700">{current.name}</div>
              <div className="text-xs">{formatSize(current.size)}</div>
            </div>
          )}
        </div>

        {files.length > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Следующий файл"
            title="Следующий файл"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {files.length > 1 && (
        <div className="mt-4 flex gap-1.5">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Файл ${i + 1}`}
              className={`h-2 w-2 rounded-full transition-colors ${i === index ? "bg-neutral-900" : "bg-neutral-200 hover:bg-neutral-300"}`}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="max-w-[220px] truncate text-neutral-500">{current.name}</span>
        <a href={downloadUrl(current.id)} className="flex items-center gap-1 text-indigo-600 hover:underline">
          <Download size={13} />
          Скачать
        </a>
        {canEdit && (
          <form action={removeFileFromCollectionAction}>
            <input type="hidden" name="collectionId" value={collectionId} />
            <input type="hidden" name="fileId" value={current.id} />
            <ConfirmSubmitButton
              confirmMessage="Убрать этот файл из коллекции? Сам файл в «Файлах» останется."
              className="text-neutral-400 hover:text-red-600"
            >
              Убрать из коллекции
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
