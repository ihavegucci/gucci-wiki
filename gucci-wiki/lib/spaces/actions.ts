"use server";

import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { slugify, createWithUniqueSlug } from "@/lib/slug";
import { SPACE_ICON_KEYS, SPACE_COLOR_KEYS } from "@/lib/spaces/icons";
import { canEdit, assertCanEdit } from "@/lib/permissions";

export type CreateSpaceState = { error: string } | null;

export async function createSpaceAction(
  _prev: CreateSpaceState,
  formData: FormData
): Promise<CreateSpaceState> {
  const user = await getCurrentUser();
  if (!canEdit(user)) {
    return { error: "Недостаточно прав для создания пространства." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Название пространства обязательно." };

  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "");
  const color = String(formData.get("color") ?? "");

  const space = await createWithUniqueSlug(
    slugify(name),
    (candidate) => prisma.space.findUnique({ where: { slug: candidate } }).then(Boolean),
    (slug) =>
      prisma.space.create({
        data: {
          name,
          slug,
          description: description || null,
          icon: SPACE_ICON_KEYS.includes(icon) ? icon : null,
          color: SPACE_COLOR_KEYS.includes(color) ? color : null,
          // Создатель пространства становится его "владельцем" — адресат
          // эскалации устаревания статей в куске 4 (G02.2).
          ownerId: user.id,
        },
      })
  );

  revalidatePath("/");
  redirect(`/spaces/${space.slug}`);
}

// Каскадное удаление статей пространства обеспечивает Prisma
// (Page.spaceId → onDelete: Cascade в schema.prisma) — отдельная
// транзакция не нужна.
export async function deleteSpaceAction(formData: FormData) {
  const user = await getCurrentUser();
  assertCanEdit(user);

  const spaceId = String(formData.get("spaceId") ?? "");
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) notFound();

  await prisma.space.delete({ where: { id: spaceId } });

  revalidatePath("/");
  revalidatePath("/spaces");
  redirect("/");
}
