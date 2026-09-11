"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Folder, Trash2, Pencil } from "lucide-react";
import { renameFolderAction, deleteFolderAction } from "@/lib/files/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

// Одна карточка папки. Вынесена из FolderGrid отдельным клиентским
// компонентом ради переименования: у каждой карточки своё состояние формы,
// а хук нельзя вызывать в цикле — поэтому цикл остаётся в серверном
// FolderGrid, а хук живёт здесь, по одному на карточку.
export default function FolderCard({
  folder,
  canEdit,
}: {
  folder: { id: string; name: string };
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setName(folder.name);
    setError(null);
    setEditing(true);
  }

  // Экшен вызывается напрямую внутри транзакции, а не через `useActionState`:
  // закрыть форму нужно только по успеху, а сделать это эффектом по ответу
  // нельзя — правило react-hooks/set-state-in-effect у проекта включено как
  // ошибка. При неудаче («такое имя уже есть») форма остаётся открытой с
  // причиной, а введённое название не теряется — поле контролируемое, и
  // сброс формы, который React делает перед вызовом экшена, его не трогает.
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await renameFolderAction(null, formData);
      if (result?.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(result?.error ?? "Не удалось переименовать папку.");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col rounded-xl border border-neutral-300 bg-white p-4">
        <form action={handleSubmit} className="space-y-2">
          <input type="hidden" name="folderId" value={folder.id} />
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={120}
            aria-label="Название папки"
            className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm">
      {/* Растянутая ссылка на всю карточку, не только на иконку. */}
      <Link href={`/files/${folder.id}`} className="absolute inset-0" aria-label={folder.name} />
      <div className="pointer-events-none flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
          <Folder size={24} strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
        </div>
        <div className="max-w-full truncate text-sm font-medium text-neutral-900">{folder.name}</div>
      </div>

      {canEdit && (
        // Кнопки поверх растянутой ссылки — своя позиция и свой слой, иначе
        // клик по ним уходил бы в переход внутрь папки.
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={open}
            aria-label={`Переименовать папку «${folder.name}»`}
            title="Переименовать"
            className="relative flex h-6 w-6 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <Pencil size={13} />
          </button>
          <form action={deleteFolderAction} className="relative">
            <input type="hidden" name="folderId" value={folder.id} />
            <ConfirmSubmitButton
              confirmMessage={`Удалить папку «${folder.name}»? Все файлы внутри неё тоже будут удалены безвозвратно.`}
              className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
