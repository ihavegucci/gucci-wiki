import { describe, it, expect } from "vitest";
import { attachmentHeader } from "@/lib/storage/contentDisposition";

// Регресс на находки QA-прогона 3 по заголовку Content-Disposition:
//  - скачивание бэкапа собирало заголовок из сырого ключа, поэтому перевод
//    строки в нём означал инъекцию нового заголовка в ответ (а на строгом
//    стеке — 500 при сборке Headers);
//  - две другие копии этой защиты чистили только не-ASCII и пропускали
//    кавычку, которая закрывает параметр filename="...".
describe("attachmentHeader", () => {
  it("всегда помечает ответ как вложение", () => {
    expect(attachmentHeader("report.pdf")).toContain("attachment;");
  });

  it("вырезает перевод строки — инъекция заголовка невозможна", () => {
    const header = attachmentHeader("x\r\nX-Injected: 1");
    // Достаточно, что CR и LF не дожили до значения заголовка: без них
    // остаток — просто часть имени файла, а не новый заголовок. И сам
    // заголовок теперь конструируется без исключения (раньше сырой ключ
    // с переводом строки ронял сборку Headers пятисоткой).
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(() => new Headers({ "Content-Disposition": header })).not.toThrow();
  });

  it("вырезает кавычку и обратный слэш — параметр filename не разорвать", () => {
    const header = attachmentHeader('отчёт".pdf');
    const asciiPart = header.slice(header.indexOf('filename="'), header.indexOf("; filename*="));
    // Кавычки в ascii-части ровно две: открывающая и закрывающая.
    expect(asciiPart.split('"').length - 1).toBe(2);
    expect(attachmentHeader('a\\b"c')).toContain('filename="a_b_c"');
  });

  it("сохраняет настоящее имя в filename* по RFC 5987", () => {
    const header = attachmentHeader("отчёт за квартал.pdf");
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("отчёт за квартал.pdf")}`);
  });

  it("не отдаёт пустое имя файла", () => {
    expect(attachmentHeader("»»»")).toContain('filename="___"');
    expect(attachmentHeader("")).toContain('filename="file"');
  });
});
