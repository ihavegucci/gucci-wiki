"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Roadmap } from "@prisma/client";
import { renameRoadmapAction, deleteRoadmapAction } from "@/lib/roadmaps/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

// Заголовок карты на /roadmaps/[id]: название+описание, или инлайн-форма
// переименования (renameRoadmapAction), плюс удаление всей карты. Только
// canEdit — страница передаёт canEdit и не рендерит компонент иначе.
export default function RoadmapHeader({ roadmap }: { roadmap: Roadmap }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await renameRoadmapAction(formData);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form action={handleSubmit} className="flex-1 space-y-2.5">
        <input type="hidden" name="roadmapId" value={roadmap.id} />
        <input
          name="title"
          defaultValue={roadmap.title}
          required
          autoFocus
          className="w-full max-w-md rounded-lg border border-neutral-200 px-3 py-1.5 text-lg font-bold outline-none focus:border-neutral-400"
        />
        <input
          name="description"
          defaultValue={roadmap.description ?? ""}
          placeholder="Короткое описание"
          className="w-full max-w-md rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            Отмена
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{roadmap.title}</h1>
        {roadmap.description && <p className="mt-1 text-neutral-500">{roadmap.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <Pencil size={15} />
          Переименовать
        </button>
        <form action={deleteRoadmapAction}>
          <input type="hidden" name="roadmapId" value={roadmap.id} />
          <ConfirmSubmitButton
            confirmMessage={`Удалить карту «${roadmap.title}»? Все её этапы тоже будут удалены безвозвратно.`}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={15} />
            Удалить карту
          </ConfirmSubmitButton>
        </form>
      </div>
    </>
  );
}
