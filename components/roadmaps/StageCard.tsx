"use client";

import { Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import type { RoadmapStage } from "@prisma/client";
import { moveStageAction, deleteStageAction } from "@/lib/roadmaps/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { STAGE_STATUS_META } from "./statusMeta";

// Карточка одного этапа/ветки (кусок 5, R01.4). orientation решает, какая
// пара стрелок показана для перестановки среди "братьев" (moveStageAction):
// горизонтальная — влево/вправо для основной цепочки, вертикальная —
// вверх/вниз для веток, сложенных стопкой под родителем.
export default function StageCard({
  stage,
  selected,
  onSelect,
  canEdit,
  orientation = "horizontal",
  disableMoveBack,
  disableMoveForward,
}: {
  stage: RoadmapStage;
  selected: boolean;
  onSelect: () => void;
  canEdit: boolean;
  orientation?: "horizontal" | "vertical";
  disableMoveBack?: boolean;
  disableMoveForward?: boolean;
}) {
  const meta = STAGE_STATUS_META[stage.status];
  const BackIcon = orientation === "horizontal" ? ChevronLeft : ChevronUp;
  const ForwardIcon = orientation === "horizontal" ? ChevronRight : ChevronDown;

  return (
    <div
      className={`w-52 shrink-0 rounded-xl border bg-white p-3.5 transition-all hover:shadow-sm ${
        selected ? "border-indigo-400 ring-1 ring-indigo-100" : "border-neutral-200"
      }`}
    >
      {/* Открытие панели деталей — настоящая кнопка, а не div с onClick:
          иначе карточка недостижима с клавиатуры и не читается скринридером. */}
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="block w-full cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
          <div className="min-w-0 truncate font-medium text-neutral-900">{stage.title}</div>
        </div>
        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
          {meta.label}
        </span>
      </button>

      {canEdit && (
        <div
          className="mt-2.5 flex items-center gap-1 border-t border-neutral-100 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <form action={moveStageAction}>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={disableMoveBack}
              title="Переставить раньше"
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
            >
              <BackIcon size={14} />
            </button>
          </form>
          <form action={moveStageAction}>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={disableMoveForward}
              title="Переставить позже"
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
            >
              <ForwardIcon size={14} />
            </button>
          </form>
          <form action={deleteStageAction} className="ml-auto">
            <input type="hidden" name="stageId" value={stage.id} />
            <ConfirmSubmitButton
              confirmMessage={`Удалить этап «${stage.title}»?${stage.parentId ? "" : " Все его ветки тоже будут удалены."}`}
              className="rounded p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
