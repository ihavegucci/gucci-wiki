import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Три секрета (ключи S3 и токен бота) лежат в таблице Settings, а суточный
// pg_dump уезжает в тот же самый S3-бакет: утечка одного дампа отдавала бы
// разом и ключи от бакета, и токен бота. Поэтому секреты шифруются на
// уровне приложения — тип колонки при этом не меняется (в БД по-прежнему
// строка), миграция не нужна.
//
// Формат самоописательный: enc:v1:<iv>:<tag>:<ciphertext>, всё в base64.
// Префикс нужен, чтобы отличить шифротекст от значения, сохранённого до
// появления шифрования: без префикса — старое открытое значение.
const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // рекомендованный размер nonce для GCM
const TAG_LENGTH = 16;

// Соль фиксирована и лежит в коде намеренно: она не секрет, её единственная
// задача — развести scrypt этого проекта с любым другим применением того же
// пароля. Случайная соль на каждое значение потребовала бы хранить её
// рядом с шифротекстом и ничего бы не добавила: сам пароль всё равно один.
const SCRYPT_SALT = "gucci-wiki/settings/v1";

// scryptSync намеренно медленный (в этом его смысл), а getSettings() зовут
// из сайдбара на каждый рендер — держим выведенный ключ в памяти, пока
// значение переменной окружения не изменилось (в проде оно не меняется).
let derived: { raw: string; key: Buffer } | null = null;

function getKey(): Buffer | null {
  const raw = process.env.SETTINGS_KEY ?? "";
  if (!raw) return null;
  if (derived?.raw !== raw) derived = { raw, key: scryptSync(raw, SCRYPT_SALT, 32) };
  return derived.key;
}

// Логируем провал расшифровки один раз за жизнь процесса: это состояние
// (ключ сменили или потеряли) не чинится само и держится до ввода настроек
// заново, а зовётся расшифровка на каждый рендер страницы — построчный лог
// забил бы вывод целиком и скрыл всё остальное.
let failureLogged = false;

function logFailureOnce(field: string) {
  if (failureLogged) return;
  failureLogged = true;
  // В лог не попадает ни значение, ни ключ — только имя поля: сообщение об
  // ошибке шифрования не должно становиться новым каналом утечки секрета.
  console.error(
    `[settings] не удалось расшифровать поле ${field}: SETTINGS_KEY не задан или не тот, ` +
      `которым значение шифровалось. Поле считается ненастроенным — введите значение заново ` +
      `в /settings. Дальнейшие такие ошибки не логируются.`
  );
}

// Без ключа возвращаем значение как есть — установка без SETTINGS_KEY
// обязана работать ровно как раньше, апгрейд не должен требовать новой
// обязательной переменной окружения.
export function encryptSecret(value: string): string {
  const key = getKey();
  if (!key || value === "") return value;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(":");
}

// Никогда не бросает: getSettings() зовётся из сайдбара, то есть на каждый
// рендер каждой страницы, и исключение отсюда означало бы белый экран всей
// вики из-за одного нечитаемого поля. Нерасшифровываемое значение — это
// null, то есть «поле не настроено»: вика работает, S3/бот молчат до тех
// пор, пока админ не введёт значения заново.
export function decryptSecret(value: string | null, field: string): string | null {
  if (!value || !value.startsWith(PREFIX)) return value; // старое открытое значение

  const key = getKey();
  if (!key) {
    logFailureOnce(field);
    return null;
  }

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    logFailureOnce(field);
    return null;
  }

  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
    // base64 от мусора не бросает, поэтому длины проверяем сами — иначе
    // ошибка вылезла бы уже из createDecipheriv менее внятным способом.
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      logFailureOnce(field);
      return null;
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Сам объект ошибки не логируем: не тот случай, где содержимое
    // исключения полезнее риска утащить в лог что-то лишнее.
    logFailureOnce(field);
    return null;
  }
}
