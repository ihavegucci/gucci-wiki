import { describe, it, expect } from "vitest";
import { sniffImageType } from "@/lib/storage/sniff";

// Регресс на находку слепой проверки (G3): загрузка доверяла заголовку
// Content-Type из формы (полностью подделываемому отправителем) вместо
// реального содержимого файла.
describe("sniffImageType", () => {
  it("узнаёт PNG по сигнатуре", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffImageType(png)).toBe("image/png");
  });

  it("узнаёт JPEG по сигнатуре", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("узнаёт GIF по сигнатуре", () => {
    const gif = new TextEncoder().encode("GIF89a...");
    expect(sniffImageType(gif)).toBe("image/gif");
  });

  it("узнаёт WEBP по двум частям сигнатуры (RIFF...WEBP)", () => {
    const webp = new Uint8Array(16);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("HTML с поддельным Content-Type: image/png не проходит — сигнатура не совпадает", () => {
    const fakeImage = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(sniffImageType(fakeImage)).toBeNull();
  });

  it("пустой/слишком короткий буфер — null, не падение", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
  });
});
