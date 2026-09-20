import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

// cache() дедуплицирует вызов на один рендер запроса: почти каждый layout
// и вложенная в него page по отдельности зовут getCurrentUser() (32 места
// в проекте) — без этого один переход по страницам с /settings-обёрткой
// или /(app)-обёрткой бил по БД дважды за один и тот же запрос ради одного
// и того же пользователя. Область действия — только текущий рендер
// (Next.js сбрасывает cache() между запросами), поэтому роль/статус
// остаются такими же свежими, как раньше.
export const getCurrentUser = cache(async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  // Ни один текущий путь не переводит уже ACTIVE-пользователя обратно в
  // PENDING (approve — только PENDING→ACTIVE, смена роли/удаление не
  // трогают status) — сегодня это чистая защита на будущее: если такой
  // путь появится, сессия перестанет считаться валидной немедленно, без
  // отдельной правки здесь.
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});
