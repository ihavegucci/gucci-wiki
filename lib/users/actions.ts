"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

// Только Admin (кусок 2, R01/R03/R06). Server actions, не route-хендлер —
// поэтому бросаем исключение вместо NextResponse, как assertCanEdit
// в lib/permissions делает для canEdit.
async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Недостаточно прав для этого действия.");
  }
  return user;
}

// Роль при подтверждении заявки — только Editor/Viewer (Admin назначается
// исключительно первым пользователем при регистрации, см. кусок 1).
const APPROVE_ROLES: Role[] = ["EDITOR", "VIEWER"];
const ALL_ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER"];

// PENDING → ACTIVE с одновременным назначением роли.
export async function approveUserAction(formData: FormData) {
  const admin = await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!APPROVE_ROLES.includes(role)) {
    throw new Error("Некорректная роль.");
  }
  // Те же две защиты, что и у соседних экшенов (QA-прогон 3). Форма
  // подтверждения рисуется только для PENDING, но сам экшен принимал любой
  // POST с любым userId: единственный админ, отправив сюда свой id с
  // role=VIEWER (устаревшая вкладка, двойная отправка, ручной запрос),
  // разжаловал сам себя — и вернуть роль было уже некому, инстанс
  // оставался без администратора до правки БД руками.
  if (userId === admin.id) {
    throw new Error("Нельзя изменить собственную роль.");
  }

  // updateMany с условием на статус: подтверждать имеет смысл только
  // заявку, а не уже активного пользователя (иначе экшен работает как
  // тихая смена роли в обход changeUserRoleAction).
  const result = await prisma.user.updateMany({
    where: { id: userId, status: "PENDING" },
    data: { status: "ACTIVE", role },
  });
  if (result.count === 0) {
    throw new Error("Заявка не найдена — возможно, её уже подтвердили.");
  }

  revalidatePath("/admin/users");
}

// Смена роли у уже ACTIVE пользователя. Admin не может разжаловать себя.
export async function changeUserRoleAction(formData: FormData) {
  const admin = await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!ALL_ROLES.includes(role)) {
    throw new Error("Некорректная роль.");
  }
  if (userId === admin.id) {
    throw new Error("Нельзя изменить собственную роль.");
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });

  revalidatePath("/admin/users");
}

// Admin не может удалить сам себя.
export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) {
    throw new Error("Нельзя удалить самого себя.");
  }

  // deleteMany: пользователя может уже не быть (два админа удаляют
  // одновременно, устаревшая вкладка) — P2025 здесь означал бы экран
  // ошибки вместо просто обновлённого списка.
  await prisma.user.deleteMany({ where: { id: userId } });

  revalidatePath("/admin/users");
}
