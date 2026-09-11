// Определение реального типа файла по сигнатуре байт (magic numbers), а не
// по заголовку Content-Type, который отправляет клиент — тот полностью
// подделываемый (обычный POST с любым заголовком, в обход File-инпута с
// accept="image/*" в браузере). Слепая проверка (G3) подтвердила это живым
// запросом: HTML с Content-Type: image/png проходил серверную проверку типа.
const SIGNATURES: Array<{ type: string; bytes: number[]; offset?: number }> = [
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8" — общее для 87a/89a
];

export function sniffImageType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (matches(bytes, sig.bytes, offset)) return sig.type;
  }
  // WEBP: RIFF....WEBP — два непримыкающих куска сигнатуры.
  if (
    matches(bytes, [0x52, 0x49, 0x46, 0x46], 0) &&
    matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

function matches(bytes: Uint8Array, expected: number[], offset: number): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((b, i) => bytes[offset + i] === b);
}
