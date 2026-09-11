"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertCanEdit } from "@/lib/permissions";

export type CreateQuestionState = { ok: true } | { ok: false; error: string } | null;

const QUESTION_MAX_LENGTH = 5000;

// Кнопка «Создать запрос» на главной (кусок 4, R11) — любой залогиненный
// пользователь может отправить вопрос, попадает во вкладку "Вопросы" (Editor+Admin).
export async function createQuestionAction(
  _prev: CreateQuestionState,
  formData: FormData
): Promise<CreateQuestionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Нужно войти, чтобы отправить вопрос." };

  // Потолок длины: поле в схеме — TEXT без ограничения, а форма шлёт
  // обычный POST. Без проверки любой залогиненный (в том числе Viewer)
  // клал в БД вопрос на десятки мегабайт — он же потом попадал в суточный
  // дамп и рендерился на странице «Вопросы» у всех редакторов.
  const text = String(formData.get("text") ?? "").trim().slice(0, QUESTION_MAX_LENGTH);
  if (!text) return { ok: false, error: "Введите текст вопроса." };

  await prisma.question.create({
    data: { text, authorId: user.id },
  });

  revalidatePath("/questions");
  return { ok: true };
}

// Только Editor/Admin (R12) — помечает решённым, не удаляет (история остаётся).
export async function resolveQuestionAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const questionId = String(formData.get("questionId") ?? "");
  // updateMany вместо update: несуществующий/уже удалённый вопрос (гонка с
  // повторной отправкой формы, битый questionId) молча даёт count === 0
  // вместо необработанного исключения Prisma (P2025), которое уронило бы
  // рендер страницы.
  await prisma.question.updateMany({
    where: { id: questionId },
    data: { resolved: true },
  });

  revalidatePath("/questions");
}
