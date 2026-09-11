import type { Role } from "@prisma/client";

type RoleUser = { role: Role } | null | undefined;

// Единая проверка прав (кусок 8): Viewer — только чтение, Editor и Admin
// могут создавать/редактировать. Заменяет временные `role !== "VIEWER"`,
// разбросанные по actions.ts/route.ts предыдущих кусков. Type predicate —
// `if (!canEdit(user)) return/throw` сужает user до не-null дальше по коду.
export function canEdit(user: RoleUser): user is NonNullable<RoleUser> {
  return !!user && user.role !== "VIEWER";
}

// Для server actions, где отсутствие прав — это исключение, а не просто
// ветка с ответом (route-хендлеры сами формируют NextResponse через canEdit).
// Assertion-сигнатура сужает тип user до не-null после вызова.
export function assertCanEdit(user: RoleUser): asserts user is NonNullable<RoleUser> {
  if (!canEdit(user)) {
    throw new Error("Недостаточно прав для этого действия.");
  }
}
