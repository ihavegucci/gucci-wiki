"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createRoadmapAction } from "@/lib/roadmaps/actions";

// Кнопка «Новая карта» на /roadmaps (видна только canEdit — страница сама
// решает, рендерить ли компонент). Схлопнута в кнопку, пока не открыта, как
// AddStageForm рядом.
export default function NewRoadmapForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createRoadmapAction(formData);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        <Plus size={16} />
        Новая карта
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="w-full max-w-sm space-y-2.5 rounded-xl border border-neutral-200 bg-white p-4 md:w-80"
    >
      <input
        name="title"
        required
        autoFocus
        placeholder="Название карты"
        className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
      />
      <input
        name="description"
        placeholder="Короткое описание (необязательно)"
        className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Создание…" : "Создать"}
        </button>
      </div>
    </form>
  );
}
