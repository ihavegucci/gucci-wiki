"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { RoadmapStage } from "@prisma/client";
import StageEditForm from "./StageEditForm";
import { STAGE_STATUS_META } from "./statusMeta";

// Панель деталей выбранного этапа — открывается кликом по карточке
// (RoadmapChain.tsx). Viewer видит description/owner только для чтения,
// canEdit получает кнопку «Редактировать» → StageEditForm. Сброс `editing`
// при переключении на другой этап — через `key={stage.id}` у вызывающей
// стороны (RoadmapChain.tsx), не через эффект: React сам пересоздаёт
// компонент, лишний рендер не нужен.
export default function StageDetailPanel({
  stage,
  canEdit,
  onClose,
}: {
  stage: RoadmapStage;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const meta = STAGE_STATUS_META[stage.status];

  return (
    <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-neutral-900">{stage.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
          </div>
          {stage.branchLabel && (
            <p className="mt-1 text-xs text-amber-600">Условие: {stage.branchLabel}</p>
          )}
          {stage.owner && <p className="mt-1 text-sm text-neutral-500">Ответственный: {stage.owner}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Редактировать
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Закрыть панель этапа"
            title="Закрыть"
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {editing ? (
        <StageEditForm stage={stage} onDone={() => setEditing(false)} />
      ) : stage.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-600">{stage.description}</p>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">Описание пока не добавлено.</p>
      )}
    </div>
  );
}
