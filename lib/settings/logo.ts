import { sniffImageType } from "@/lib/storage/sniff";

// Ограничения из брифа (R16): только PNG, ≤2 МБ, ≤1000×1000, с прозрачным
// фоном. Формат файла и подпись проверяются по байтам (sniffImageType), а
// не по Content-Type/расширению — тот же принцип, что уже применён к
// загрузке картинок в статьи (см. app/api/upload/route.ts).
export const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 МБ
export const MAX_LOGO_DIMENSION = 1000; // 1000×1000

export type LogoValidation = { ok: true } | { ok: false; error: string };

// PNG-заголовок: 8 байт сигнатуры, затем чанк IHDR (4 байта длины + "IHDR" +
// данные) — ширина/высота лежат по фиксированному смещению 16/20, тип
// цвета — 25 (см. спецификацию PNG, раздел 11.2.2). Полный аудит
// прозрачности потребовал бы декодирования пикселей — вместо этого
// проверяется наличие альфа-канала в заголовке (color type 4 или 6),
// см. «Известное упрощение (D02)» в plan.md.
export function validateLogoPng(bytes: Uint8Array, size: number): LogoValidation {
  if (size > MAX_LOGO_SIZE) {
    return { ok: false, error: "Файл слишком большой (максимум 2 МБ)." };
  }
  if (sniffImageType(bytes) !== "image/png") {
    return { ok: false, error: "Логотип должен быть в формате PNG." };
  }
  if (bytes.length < 26) {
    return { ok: false, error: "Файл повреждён — это не похоже на PNG." };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const colorType = bytes[25];

  if (width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION) {
    return { ok: false, error: "Слишком большой размер изображения (максимум 1000×1000)." };
  }
  if (colorType !== 4 && colorType !== 6) {
    return { ok: false, error: "PNG должен быть с прозрачным фоном (альфа-каналом)." };
  }

  return { ok: true };
}
