import { prisma } from "@/lib/db/prisma";
import type { Settings } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/settings/crypto";

const SETTINGS_ID = "singleton";

// Ограничение из правки пользователя после первого прогона: рядом с
// «gucci-wiki» в сайдбаре мало места, длинное название ломает вёрстку.
export const COMPANY_NAME_MAX_LENGTH = 14;

export type SettingsUpdateInput = {
  s3Endpoint?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  telegramBotToken?: string;
  companyName?: string;
  logoUrl?: string;
  logoKey?: string;
  backupEnabled?: boolean;
};

// Не-секретные поля — заменяются значением из формы как есть (даже пустой
// строкой, чтобы можно было очистить). Секретные — только если реально
// прислали новое значение; пустая строка от формы значит "оставить как есть"
// (клиент никогда не получает сохранённый секрет обратно, см. toPublicSettings).
const SECRET_FIELDS = ["s3AccessKey", "s3SecretKey", "telegramBotToken"] as const;

// Шифрование прозрачное: наружу (в s3.ts, telegram/*, /settings) значения
// уходят всегда расшифрованными, поэтому ни один вызывающий код менять не
// пришлось. Единственная точка входа секрета в БД — updateSettings, выхода —
// getSettings, здесь обе и обёрнуты.
function withDecryptedSecrets(settings: Settings): Settings {
  return {
    ...settings,
    s3AccessKey: decryptSecret(settings.s3AccessKey, "s3AccessKey"),
    s3SecretKey: decryptSecret(settings.s3SecretKey, "s3SecretKey"),
    telegramBotToken: decryptSecret(settings.telegramBotToken, "telegramBotToken"),
  };
}

// Чтение настроек — именно чтение (QA-прогон 3). Раньше здесь стоял
// `upsert` с пустым `update`, а это полноценный INSERT ... ON CONFLICT DO
// UPDATE: блокировка строки и новая версия кортежа на КАЖДЫЙ вызов. А
// вызывается это из сайдбара, то есть на каждый рендер каждой страницы у
// каждого пользователя — таблица из одной строки копила десятки тысяч
// мёртвых версий в сутки, и все параллельные запросы выстраивались в
// очередь на блокировке одной и той же строки. Создание синглтона
// оставлено как редкий запасной путь (первый запуск до сохранения
// настроек), причём гонка двух первых читателей закрыта тем же приёмом
// catch(P2002) + перечитывание, что и в lib/slug.ts.
export async function getSettings(): Promise<Settings> {
  return withDecryptedSecrets(await readSettingsRow());
}

async function readSettingsRow(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  try {
    return await prisma.settings.create({ data: { id: SETTINGS_ID } });
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err;
    return prisma.settings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  }
}

export async function updateSettings(input: SettingsUpdateInput): Promise<Settings> {
  const data: Record<string, string | boolean | null> = {};

  // backupEnabled — булево, не строка: собирается отдельно от общего цикла
  // ниже, который считает все значения строками (секретность/обрезка длины
  // companyName на них не применимы).
  if (input.backupEnabled !== undefined) {
    data.backupEnabled = input.backupEnabled;
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === "backupEnabled" || value === undefined) continue;
    if ((SECRET_FIELDS as readonly string[]).includes(key)) {
      if (value === "") continue;
      // Здесь же и происходит миграция старых открытых значений: первое
      // сохранение любого секрета после появления SETTINGS_KEY кладёт в БД
      // уже шифротекст, отдельного прохода по таблице не требуется.
      data[key] = encryptSecret(value as string);
      continue;
    }
    // Тот же лимит, что и на клиенте (maxLength поля) — обрезаем и здесь,
    // на случай прямого запроса к API в обход формы.
    data[key] = key === "companyName" ? (value as string).slice(0, COMPANY_NAME_MAX_LENGTH) : value;
  }

  const saved = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { id: SETTINGS_ID, ...data },
  });
  return withDecryptedSecrets(saved);
}

export type PublicSettings = {
  s3: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyConfigured: boolean;
    secretKeyConfigured: boolean;
  };
  telegram: {
    botTokenConfigured: boolean;
  };
  personalization: {
    companyName: string;
    logoUrl: string | null;
  };
  backup: {
    enabled: boolean;
    lastAt: string | null;
    lastStatus: "OK" | "ERROR" | null;
    lastError: string | null;
  };
  updatedAt: string;
};

// Отдаётся в клиентский JS. Секреты никогда не возвращаются — только
// факт "настроено". Эндпоинт/бакет/регион секретами не являются, их
// можно показывать как есть, чтобы админ видел, что уже введено.
//
// На вход сюда всегда приходит уже расшифрованный Settings (getSettings /
// updateSettings), поэтому нерасшифровываемое поле даёт здесь честное
// "не настроено", а не зелёную галочку у значения, которым приложение всё
// равно не может воспользоваться.
export function toPublicSettings(settings: Settings): PublicSettings {
  return {
    s3: {
      endpoint: settings.s3Endpoint ?? "",
      bucket: settings.s3Bucket ?? "",
      region: settings.s3Region ?? "",
      accessKeyConfigured: Boolean(settings.s3AccessKey),
      secretKeyConfigured: Boolean(settings.s3SecretKey),
    },
    telegram: {
      botTokenConfigured: Boolean(settings.telegramBotToken),
    },
    // Не секреты — логотип публичный (виден на главной всем), название
    // компании тоже, поэтому отдаются как есть, а не только "настроено/нет".
    personalization: {
      companyName: settings.companyName ?? "",
      logoUrl: settings.logoUrl || null,
    },
    backup: {
      enabled: settings.backupEnabled,
      lastAt: settings.backupLastAt ? settings.backupLastAt.toISOString() : null,
      lastStatus: settings.backupLastStatus,
      lastError: settings.backupLastError,
    },
    updatedAt: settings.updatedAt.toISOString(),
  };
}
