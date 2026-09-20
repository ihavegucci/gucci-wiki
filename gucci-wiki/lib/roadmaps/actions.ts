"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCanEdit } from "@/lib/permissions";
import type { RoadmapStageStatus } from "@prisma/client";

// Значение статуса приходит из FormData обычной строкой. Приведение
// `as RoadmapStageStatus` типы успокаивает, но ничего не проверяет: любой
// POST со `status=WHATEVER` доезжал до Prisma и падал там необработанной
// ошибкой невалидного enum — вместо понятного текста пользователь получал
// общий экран ошибки. Рядом, в lib/users/actions.ts, роль ровно так же
// приходит строкой и там проверяется по списку — делаем то же самое.
const STAGE_STATUSES: RoadmapStageStatus[] = ["DONE", "ACTIVE", "ATTENTION", "UPCOMING"];

function parseStageStatus(raw: FormDataEntryValue | null, fallback: RoadmapStageStatus): RoadmapStageStatus {
  if (raw === null) return fallback;
  const value = String(raw) as RoadmapStageStatus;
  if (!STAGE_STATUSES.includes(value)) {
    throw new Error("Некорректный статус этапа.");
  }
  return value;
}

// Потолок на пользовательские строки: в схеме это TEXT без ограничения.
const TITLE_MAX_LENGTH = 200;
const TEXT_MAX_LENGTH = 4000;

// --- Карты ---

export async function createRoadmapAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) throw new Error("Название карты обязательно.");
  const description = String(formData.get("description") ?? "").trim().slice(0, TEXT_MAX_LENGTH);

  const roadmap = await prisma.roadmap.create({
    data: { title, description: description || null, authorId: user.id },
  });

  revalidatePath("/roadmaps");
  return roadmap;
}

export async function renameRoadmapAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const roadmapId = String(formData.get("roadmapId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) throw new Error("Название карты обязательно.");
  const description = String(formData.get("description") ?? "").trim().slice(0, TEXT_MAX_LENGTH);

  // updateMany: карту могли удалить в другой вкладке — update бросил бы
  // P2025 и уронил страницу вместо понятного сообщения.
  const renamed = await prisma.roadmap.updateMany({
    where: { id: roadmapId },
    data: { title, description: description || null },
  });
  if (renamed.count === 0) throw new Error("Карта больше не существует.");

  revalidatePath("/roadmaps");
  revalidatePath(`/roadmaps/${roadmapId}`);
}

// Каскадное удаление этапов обеспечивает Prisma (RoadmapStage.roadmapId →
// onDelete: Cascade в schema.prisma).
export async function deleteRoadmapAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const roadmapId = String(formData.get("roadmapId") ?? "");
  const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
  if (!roadmap) notFound();

  await prisma.roadmap.delete({ where: { id: roadmapId } });

  revalidatePath("/roadmaps");
  // Как deleteSpaceAction в lib/spaces/actions.ts — уводим со страницы
  // удалённой карты, иначе следующая навигация упирается в notFound().
  redirect("/roadmaps");
}

// --- Этапы и ветки ---

// parentId отсутствует/пуст → узел основной цепочки; задан → ветка от
// указанного этапа. order — в конец списка "братьев" (общий parentId).
export async function createStageAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const roadmapId = String(formData.get("roadmapId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) throw new Error("Название этапа обязательно.");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const status = parseStageStatus(formData.get("status"), "UPCOMING");
  const owner = String(formData.get("owner") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  const description = String(formData.get("description") ?? "").trim().slice(0, TEXT_MAX_LENGTH);
  const branchLabel = String(formData.get("branchLabel") ?? "").trim().slice(0, TITLE_MAX_LENGTH);

  // Карта могла быть удалена: без этой проверки FK роняет P2003
  // необработанным исключением вместо понятного текста.
  const roadmapExists = await prisma.roadmap.findUnique({ where: { id: roadmapId }, select: { id: true } });
  if (!roadmapExists) throw new Error("Карта больше не существует.");

  // parentId приходит из formData — обычный пользовательский интерфейс
  // всегда подставляет id этапа той же карты, но ничего не мешает
  // прислать сюда id этапа из чужой карты напрямую. FK сам по себе это не
  // ловит (parentId существует, просто не в этой карте) — получилась бы
  // ветка, которая никогда не отрисуется ни на одной из двух карт (не
  // цикл, но "потерянная" запись). Проверяем явно.
  if (parentId) {
    const parent = await prisma.roadmapStage.findUnique({ where: { id: parentId }, select: { roadmapId: true } });
    if (!parent || parent.roadmapId !== roadmapId) {
      throw new Error("Родительский этап должен принадлежать той же карте.");
    }
  }

  const last = await prisma.roadmapStage.findFirst({
    where: { roadmapId, parentId },
    orderBy: { order: "desc" },
  });

  await prisma.roadmapStage.create({
    data: {
      roadmapId,
      parentId,
      order: (last?.order ?? -1) + 1,
      title,
      status,
      owner: owner || null,
      description: description || null,
      branchLabel: branchLabel || null,
    },
  });

  revalidatePath(`/roadmaps/${roadmapId}`);
}

export async function updateStageAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const stageId = String(formData.get("stageId") ?? "");
  const stage = await prisma.roadmapStage.findUnique({ where: { id: stageId } });
  if (!stage) notFound();

  const title = String(formData.get("title") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  if (!title) throw new Error("Название этапа обязательно.");
  const status = parseStageStatus(formData.get("status"), stage.status);
  const owner = String(formData.get("owner") ?? "").trim().slice(0, TITLE_MAX_LENGTH);
  const description = String(formData.get("description") ?? "").trim().slice(0, TEXT_MAX_LENGTH);
  const branchLabel = String(formData.get("branchLabel") ?? "").trim().slice(0, TITLE_MAX_LENGTH);

  await prisma.roadmapStage.update({
    where: { id: stageId },
    data: {
      title,
      status,
      owner: owner || null,
      description: description || null,
      branchLabel: branchLabel || null,
    },
  });

  revalidatePath(`/roadmaps/${stage.roadmapId}`);
}

// Каскадное удаление веток обеспечивает Prisma (RoadmapStage.parentId →
// onDelete: Cascade в schema.prisma) — удаление родителя удаляет и ветки.
export async function deleteStageAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const stageId = String(formData.get("stageId") ?? "");
  const stage = await prisma.roadmapStage.findUnique({ where: { id: stageId } });
  if (!stage) notFound();

  await prisma.roadmapStage.delete({ where: { id: stageId } });

  revalidatePath(`/roadmaps/${stage.roadmapId}`);
}

// Меняет местами order с соседом среди "братьев" (общий parentId) —
// drag-and-drop сознательно не нужен (см. «Границы»), только кнопки.
export async function moveStageAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const stageId = String(formData.get("stageId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "up" && direction !== "down") {
    throw new Error("Некорректное направление.");
  }

  const stage = await prisma.roadmapStage.findUnique({ where: { id: stageId } });
  if (!stage) notFound();

  const siblings = await prisma.roadmapStage.findMany({
    where: { roadmapId: stage.roadmapId, parentId: stage.parentId },
    orderBy: { order: "asc" },
  });

  const index = siblings.findIndex((s) => s.id === stageId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  const neighbor = siblings[neighborIndex];
  if (!neighbor) return; // уже крайний — молча ничего не делаем

  await prisma.$transaction([
    prisma.roadmapStage.update({ where: { id: stage.id }, data: { order: neighbor.order } }),
    prisma.roadmapStage.update({ where: { id: neighbor.id }, data: { order: stage.order } }),
  ]);

  revalidatePath(`/roadmaps/${stage.roadmapId}`);
}
