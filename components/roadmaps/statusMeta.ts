import type { RoadmapStageStatus } from "@prisma/client";

// Цвет + человеческая подпись статуса этапа — общие для карточки и панели
// деталей (components/roadmaps/StageCard.tsx, StageDetailPanel.tsx).
export const STAGE_STATUS_META: Record<RoadmapStageStatus, { label: string; badge: string; dot: string }> = {
  DONE: { label: "Готово", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  ACTIVE: { label: "Сейчас", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  ATTENTION: { label: "Внимание", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  UPCOMING: { label: "Впереди", badge: "bg-neutral-100 text-neutral-500", dot: "bg-neutral-400" },
};
