// Транслитерация кириллицы в латиницу для читаемых URL-слагов —
// названия пространств/статей в продукте почти всегда на русском.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const transliterated = input
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");

  const base = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "item";
}

/** Подбирает свободный слаг, добавляя -2, -3… пока `exists` возвращает true. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  let slug = base;
  let i = 2;
  while (await exists(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

/**
 * Проверка "слаг свободен" и `create` — не одна атомарная операция: два
 * параллельных запроса с одинаковым названием могут оба пройти `exists`
 * до того, как любой из них запишется, и один упадёт на unique-constraint
 * в БД. Ловим именно эту ошибку (Prisma P2002) и подбираем слаг заново —
 * без этого гонка роняла создание пространства/статьи с 500 вместо того,
 * чтобы просто взять следующий свободный номер.
 */
export async function createWithUniqueSlug<T>(
  base: string,
  exists: (slug: string) => Promise<boolean>,
  create: (slug: string) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await uniqueSlug(base, exists);
    try {
      return await create(slug);
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  throw new Error("Не удалось подобрать уникальный слаг — слишком много одновременных попыток.");
}
