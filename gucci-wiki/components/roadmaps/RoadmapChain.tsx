"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { RoadmapStage } from "@prisma/client";
import StageCard from "./StageCard";
import StageDetailPanel from "./StageDetailPanel";
import AddStageForm from "./AddStageForm";

// Раскладывает плоский список этапов (уже отсортированных по order —
// lib/roadmaps/queries.ts) в горизонтальную цепочку (parentId === null) с
// ветками-исключениями под своим родителем (parentId === родительский id),
// как на assets/Онбординг.jpg. Клик по карточке открывает панель деталей
// снизу; повторный клик по той же карточке закрывает её.
export default function RoadmapChain({
  roadmapId,
  stages,
  canEdit,
}: {
  roadmapId: string;
  stages: RoadmapStage[];
  canEdit: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const root = stages.filter((s) => s.parentId === null).sort((a, b) => a.order - b.order);
  const branchesOf = (parentId: string) =>
    stages.filter((s) => s.parentId === parentId).sort((a, b) => a.order - b.order);
  const selected = stages.find((s) => s.id === selectedId) ?? null;

  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));

  if (root.length === 0 && !canEdit) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
        В этой карте пока нет этапов.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
        {root.map((stage, i) => {
          const branches = branchesOf(stage.id);
          return (
            <div key={stage.id} className="flex items-start">
              <div className="flex flex-col items-center">
                <StageCard
                  stage={stage}
                  selected={stage.id === selectedId}
                  onSelect={() => toggle(stage.id)}
                  canEdit={canEdit}
                  orientation="horizontal"
                  disableMoveBack={i === 0}
                  disableMoveForward={i === root.length - 1}
                />

                {branches.map((branch, bi) => (
                  <div key={branch.id} className="flex flex-col items-center">
                    <div className="h-6 border-l border-dashed border-amber-400" />
                    {branch.branchLabel && (
                      <div className="mb-1 max-w-[13rem] text-center text-xs text-neutral-400">
                        {branch.branchLabel}
                      </div>
                    )}
                    <StageCard
                      stage={branch}
                      selected={branch.id === selectedId}
                      onSelect={() => toggle(branch.id)}
                      canEdit={canEdit}
                      orientation="vertical"
                      disableMoveBack={bi === 0}
                      disableMoveForward={bi === branches.length - 1}
                    />
                  </div>
                ))}

                {canEdit && (
                  <div className="mt-3">
                    <AddStageForm roadmapId={roadmapId} parentId={stage.id} label="Добавить ветку" />
                  </div>
                )}
              </div>

              {i < root.length - 1 && (
                <div className="mt-9 px-1 text-neutral-300">
                  <ChevronRight size={18} />
                </div>
              )}
            </div>
          );
        })}

        {canEdit && (
          <div className={root.length > 0 ? "ml-1 mt-0" : ""}>
            <AddStageForm roadmapId={roadmapId} label="Добавить этап" />
          </div>
        )}
      </div>

      {/* key={selected.id} — при переключении на другой этап React пересоздаёт
          панель заново, а не переиспользует, поэтому её локальное состояние
          (открытая форма редактирования) сбрасывается само, без эффекта. */}
      {selected && (
        <StageDetailPanel key={selected.id} stage={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
