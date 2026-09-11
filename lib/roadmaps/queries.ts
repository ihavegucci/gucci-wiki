import { prisma } from "@/lib/db/prisma";

// Без проверки роли — просмотр карт доступен всем залогиненным (страницы
// куска 5 сами решают, что показать, эта функция только читает).
export function listRoadmaps() {
  return prisma.roadmap.findMany({ orderBy: { createdAt: "asc" } });
}

// Карта со всеми этапами, отсортированными по order — страница куска 5
// сама раскладывает их в цепочку/ветки по parentId.
export function getRoadmap(id: string) {
  return prisma.roadmap.findUnique({
    where: { id },
    include: { stages: { orderBy: { order: "asc" } } },
  });
}
