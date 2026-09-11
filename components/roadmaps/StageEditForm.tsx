"use client";

import { useTransition } from "react";
import type { RoadmapStage } from "@prisma/client";
import { updateStageAction } from "@/lib/roadmaps/actions";
import { STAGE_STATUS_META } from "./statusMeta";
import Select from "@/components/ui/Select";

// Инлайн-редактирование текста этапа (кусок 5). Оборачиваем server action в
// startTransition, чтобы закрыть форму (onDone) сразу после применения —
// updateStageAction ничего не возвращает, а useActionState здесь избыточен.
export default function StageEditForm({ stage, onDone }: { stage: RoadmapStage; onDone: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await updateStageAction(formData);
      onDone();
    });
  }

  return (
    <form action={handleSubmit} className="mt-3 space-y-2.5">
      <input type="hidden" name="stageId" value={stage.id} />

      <input
        name="title"
        defaultValue={stage.title}
        required
        placeholder="Название этапа"
        className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
      />

      <div className="flex gap-2.5">
        <Select
          name="status"
          defaultValue={stage.status}
          className="w-40"
          options={Object.entries(STAGE_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
        />
        <input
          name="owner"
          defaultValue={stage.owner ?? ""}
          placeholder="Ответственный"
          className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {stage.parentId && (
        <input
          name="branchLabel"
          defaultValue={stage.branchLabel ?? ""}
          placeholder="Условие ветки (например «если решения нет 3 дня»)"
          className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
        />
      )}

      <textarea
        name="description"
        defaultValue={stage.description ?? ""}
        rows={3}
        placeholder="Что происходит на этом этапе"
        className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
