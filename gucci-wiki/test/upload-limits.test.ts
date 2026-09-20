import { describe, it, expect } from "vitest";
import { MAX_UPLOAD_SIZE, exceedsContentLength } from "@/lib/storage/limits";

// Регресс на критичную находку QA-прогона 3, подтверждённую живым тестом:
// загрузка 220 МБ упирала контейнер `app` в его потолок памяти (350 МБ),
// процесс умирал и контейнер перезапускался — то есть один большой файл
// ронял всю вику. Причина: размер проверялся по `file.size`, а туда можно
// попасть только после `request.formData()`, который к этому моменту уже
// втянул всё тело в память. Отсечка по Content-Length срабатывает до
// чтения тела.
function requestWithLength(length: string | null): Request {
  const headers = new Headers();
  if (length !== null) headers.set("content-length", length);
  return new Request("http://localhost/api/files/upload", { method: "POST", headers });
}

describe("exceedsContentLength", () => {
  it("отклоняет тело заметно больше лимита", () => {
    expect(exceedsContentLength(requestWithLength(String(MAX_UPLOAD_SIZE * 4)))).toBe(true);
  });

  it("пропускает тело в пределах лимита", () => {
    expect(exceedsContentLength(requestWithLength(String(MAX_UPLOAD_SIZE - 1)))).toBe(false);
  });

  it("пропускает файл ровно по лимиту вместе со служебными частями multipart", () => {
    // Запас в 1 МБ существует именно для границ и имён полей multipart:
    // файл ровно на MAX_UPLOAD_SIZE приезжает телом чуть большего размера
    // и не должен отклоняться.
    expect(exceedsContentLength(requestWithLength(String(MAX_UPLOAD_SIZE + 1024)))).toBe(false);
  });

  it("не отклоняет запрос без Content-Length (проверку сделает file.size)", () => {
    expect(exceedsContentLength(requestWithLength(null))).toBe(false);
  });

  it("не отклоняет запрос с нечисловым Content-Length", () => {
    // Только ASCII: Headers.set не принимает другие символы в значении.
    expect(exceedsContentLength(requestWithLength("not-a-number"))).toBe(false);
  });

  it("лимит остаётся в пределах памяти контейнера (лимит × 3 копии + ~150 МБ Next.js < 350 МБ)", () => {
    // Тело буферизуется трижды (formData → arrayBuffer → Buffer.from),
    // поэтому лимит и mem_limit контейнера связаны жёстко. Если кто-то
    // поднимет MAX_UPLOAD_SIZE, не подняв память, тест напомнит, почему
    // так нельзя.
    const peakBytes = MAX_UPLOAD_SIZE * 3 + 150 * 1024 * 1024;
    expect(peakBytes).toBeLessThan(350 * 1024 * 1024);
  });
});
