import { describe, it, expect } from "vitest";
import { splitHighlights } from "@/components/SearchBar";

// Регресс на stored XSS, найденный слепой проверкой (G3): snippet/quote
// раньше вставлялись через dangerouslySetInnerHTML. Теперь распознаётся
// только буквальный <b>/</b> от ts_headline — весь остальной текст, каким
// бы он ни был, идёт как текстовый узел (React экранирует сам), а не HTML.
describe("splitHighlights", () => {
  it("оборачивает подсветку ts_headline в bold-сегмент", () => {
    expect(splitHighlights("до <b>совпадение</b> после")).toEqual([
      { bold: false, text: "до " },
      { bold: true, text: "совпадение" },
      { bold: false, text: " после" },
    ]);
  });

  it("текст без подсветки — один обычный сегмент", () => {
    expect(splitHighlights("просто текст")).toEqual([{ bold: false, text: "просто текст" }]);
  });

  it("вредоносная разметка идёт как обычный текст, а не как тег", () => {
    const payload = 'hello <img src=x onerror=alert(1)';
    const segments = splitHighlights(payload);
    // Ни один сегмент не помечен bold — <img...> не совпадает с <b>/</b>,
    // значит компонент отрендерит это как текстовый узел, а не как элемент.
    expect(segments.every((s) => !s.bold)).toBe(true);
    expect(segments.map((s) => s.text).join("")).toBe(payload);
  });

  it("незакрытый <b> не остаётся жирным навечно опаснее, чем просто визуальный баг", () => {
    const segments = splitHighlights("<b>жирное до конца строки");
    expect(segments).toEqual([{ bold: true, text: "жирное до конца строки" }]);
  });
});
