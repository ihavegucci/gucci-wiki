import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Шифрование секретов в БД (QA-прогон 4): ключи S3 и токен бота лежали
// открытым текстом и попадали в суточный дамп, который льётся в тот же
// бакет — то есть утечка бэкапа отдавала ключи от самого бакета.
//
// Модуль читает SETTINGS_KEY при первом обращении и кэширует выведенный
// ключ, поэтому каждый тест импортирует его заново через resetModules —
// иначе кэш от предыдущего теста давал бы ложный результат.
async function loadCrypto(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.SETTINGS_KEY;
  else process.env.SETTINGS_KEY = key;
  return import("@/lib/settings/crypto");
}

const KEY_A = "test-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_B = "test-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SECRET = "AKIAIOSFODNN7EXAMPLE/very+secret";

describe("шифрование секретов настроек", () => {
  const original = process.env.SETTINGS_KEY;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.SETTINGS_KEY;
    else process.env.SETTINGS_KEY = original;
  });

  it("зашифрованное значение расшифровывается обратно", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto(KEY_A);
    const stored = encryptSecret(SECRET);
    expect(decryptSecret(stored, "s3AccessKey")).toBe(SECRET);
  });

  it("в хранимом виде исходного секрета не видно", async () => {
    const { encryptSecret } = await loadCrypto(KEY_A);
    const stored = encryptSecret(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored.startsWith("enc:")).toBe(true);
  });

  it("одно и то же значение шифруется по-разному (случайный IV)", async () => {
    const { encryptSecret } = await loadCrypto(KEY_A);
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it("старое открытое значение читается как есть — апгрейд не ломает установку", async () => {
    const { decryptSecret } = await loadCrypto(KEY_A);
    expect(decryptSecret(SECRET, "s3AccessKey")).toBe(SECRET);
  });

  it("без SETTINGS_KEY значения проходят насквозь, а не падают", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto(undefined);
    expect(encryptSecret(SECRET)).toBe(SECRET);
    expect(decryptSecret(SECRET, "s3AccessKey")).toBe(SECRET);
  });

  it("чужой ключ даёт null, а не исключение — вика не должна падать из-за смены ключа", async () => {
    const { encryptSecret } = await loadCrypto(KEY_A);
    const stored = encryptSecret(SECRET);

    const { decryptSecret } = await loadCrypto(KEY_B);
    expect(decryptSecret(stored, "s3AccessKey")).toBeNull();
  });

  it("шифротекст без ключа не расшифровывается и тоже не бросает", async () => {
    const { encryptSecret } = await loadCrypto(KEY_A);
    const stored = encryptSecret(SECRET);

    const { decryptSecret } = await loadCrypto(undefined);
    expect(decryptSecret(stored, "s3AccessKey")).toBeNull();
  });

  it("битое значение не бросает исключение", async () => {
    const { decryptSecret } = await loadCrypto(KEY_A);
    expect(decryptSecret("enc:v1:не-base64:мусор:вообще", "s3AccessKey")).toBeNull();
    expect(decryptSecret("enc:v1:слишком-мало-частей", "s3AccessKey")).toBeNull();
  });

  it("null остаётся null", async () => {
    const { decryptSecret } = await loadCrypto(KEY_A);
    expect(decryptSecret(null, "s3AccessKey")).toBeNull();
  });

  it("секрет не попадает в лог при неудачной расшифровке", async () => {
    const { encryptSecret } = await loadCrypto(KEY_A);
    const stored = encryptSecret(SECRET);

    const { decryptSecret } = await loadCrypto(KEY_B);
    decryptSecret(stored, "s3AccessKey");

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .map(String)
      .join(" ");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(stored);
  });
});
