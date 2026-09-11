"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createStageAction } from "@/lib/roadmaps/actions";

// Добавление этапа основной цепочки (без parentId) или ветки (с parentId) —
// один и тот же createStageAction решает это по наличию parentId в форме
// (см. lib/roadmaps/actions.ts). Схлопнута в кнопку-заглушку, пока не открыта.
export default function AddStageForm({
  roadmapId,
  parentId,
  label,
}: {
  roadmapId: string;
  parentId?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createStageAction(formData);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3.5 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-600"
      >
        <Plus size={15} />
        {label}
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="w-52 shrink-0 space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <input type="hidden" name="roadmapId" value={roadmapId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input
        name="title"
        required
        autoFocus
        placeholder="Название этапа"
        className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
      />
      {parentId && (
        <input
          name="branchLabel"
          placeholder="Условие (например «если...»)"
          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400"
        />
      )}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Добавление…" : "Добавить"}
        </button>
      </div>
    </form>
  );
}
