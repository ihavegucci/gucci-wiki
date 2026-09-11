import { describe, it, expect } from "vitest";
import { panelGeometry } from "@/components/ui/useAnchoredPanel";

// Регресс на баг, который пользователь ловил трижды: панель уезжала за
// край экрана на телефоне — сперва лицензия в шапке, потом уведомления. Оба раза она была прижата правым краем
// к кнопке помощи, а кнопка на мобильной шапке стоит не у правого края — и
// панель шириной 320px уходила влево за границу окна.
const MARGIN = 8;

describe("положение панели помощи", () => {
  it("на десктопе выравнивается по правому краю кнопки", () => {
    // Кнопка у правого края широкого окна — панель встаёт как и задумано.
    const { left, width } = panelGeometry(1400, 1440, 320);
    expect(width).toBe(320);
    expect(left).toBe(1400 - 320);
  });

  it("не уходит за ЛЕВЫЙ край на узком экране (тот самый баг)", () => {
    // 375px, кнопка в середине шапки — как на скриншоте пользователя.
    const { left } = panelGeometry(145, 375, 320);
    expect(left).toBeGreaterThanOrEqual(MARGIN);
  });

  it("не уходит за ПРАВЫЙ край, если кнопка у самого края", () => {
    const { left, width } = panelGeometry(375, 375, 320);
    expect(left + width).toBeLessThanOrEqual(375 - MARGIN);
  });

  it("на экране уже панели сжимается по ширине окна", () => {
    const { left, width } = panelGeometry(300, 320, 320);
    expect(width).toBe(320 - MARGIN * 2);
    expect(left).toBeGreaterThanOrEqual(MARGIN);
    expect(left + width).toBeLessThanOrEqual(320 - MARGIN);
  });

  it("влезает в границы окна при любом положении кнопки", () => {
    for (const viewport of [320, 375, 414, 768, 1440]) {
      // Три реальные ширины панелей проекта: уведомления и лицензия — 320,
      // подсказка в настройках — 288, свежесть — 256.
      for (const panelWidth of [320, 288, 256]) {
      for (let right = 0; right <= viewport; right += 17) {
        const { left, width } = panelGeometry(right, viewport, panelWidth);
        expect(left).toBeGreaterThanOrEqual(MARGIN);
        expect(left + width).toBeLessThanOrEqual(viewport - MARGIN);
      }
      }
    }
  });
});
