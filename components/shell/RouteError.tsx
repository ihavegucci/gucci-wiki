"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Общая разметка для error.tsx всех трёх route group'ов с сайдбаром
// (app/(app), app/(profile), app/settings) — сами файлы обязаны лежать в
// своих сегментах (иначе граница ошибок не накроет их страницы), а вид у
// них один и тот же, поэтому он здесь, а не скопирован трижды.
//
// `retry` вместо `reset`: с Next 16.3 это стабильный проп error.tsx, он
// заново запрашивает и рендерит содержимое границы, а не просто сбрасывает
// её состояние (см. node_modules/next/dist/docs — error.md).
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={20} />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-neutral-900">Что-то пошло не так</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Страница не отрисовалась из-за ошибки. Попробуйте ещё раз — если повторится, покажите
          администратору код ошибки.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-neutral-400">Код: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            Попробовать снова
          </button>
          <Link
            href="/"
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
