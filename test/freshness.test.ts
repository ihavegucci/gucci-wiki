import { describe, it, expect } from "vitest";
import { computeFreshness } from "@/lib/freshness/compute";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-05T00:00:00.000Z");

describe("computeFreshness", () => {
  it("is fresh well within the TTL", () => {
    const result = computeFreshness({
      reviewIntervalDays: 90,
      lastReviewedAt: new Date(now.getTime() - 10 * DAY),
      lastViewedAt: new Date(now.getTime() - 1 * DAY),
      createdAt: new Date(now.getTime() - 100 * DAY),
      spaceLastEditedAt: null,
      now,
    });
    expect(result.status).toBe("fresh");
    expect(result.autoDowngraded).toBe(false);
  });

  it("warns past the warn ratio but before the TTL", () => {
    const result = computeFreshness({
      reviewIntervalDays: 90,
      lastReviewedAt: new Date(now.getTime() - 70 * DAY), // 70/90 > 0.66
      lastViewedAt: new Date(now.getTime() - 1 * DAY),
      createdAt: new Date(now.getTime() - 100 * DAY),
      spaceLastEditedAt: null,
      now,
    });
    expect(result.status).toBe("warn");
  });

  it("expires once the TTL is exceeded", () => {
    const result = computeFreshness({
      reviewIntervalDays: 90,
      lastReviewedAt: new Date(now.getTime() - 91 * DAY),
      lastViewedAt: new Date(now.getTime() - 1 * DAY),
      createdAt: new Date(now.getTime() - 200 * DAY),
      spaceLastEditedAt: null,
      now,
    });
    expect(result.status).toBe("expired");
  });

  it("auto-downgrades a fresh page when the space is active but nobody opens it", () => {
    const result = computeFreshness({
      reviewIntervalDays: 90,
      lastReviewedAt: new Date(now.getTime() - 10 * DAY), // well within TTL
      lastViewedAt: new Date(now.getTime() - 30 * DAY), // not opened in a month
      createdAt: new Date(now.getTime() - 200 * DAY),
      spaceLastEditedAt: new Date(now.getTime() - 2 * DAY), // space is active
      now,
    });
    expect(result.status).toBe("warn");
    expect(result.autoDowngraded).toBe(true);
  });

  it("does not auto-downgrade when the space is quiet", () => {
    const result = computeFreshness({
      reviewIntervalDays: 90,
      lastReviewedAt: new Date(now.getTime() - 10 * DAY),
      lastViewedAt: new Date(now.getTime() - 30 * DAY),
      createdAt: new Date(now.getTime() - 200 * DAY),
      spaceLastEditedAt: new Date(now.getTime() - 60 * DAY), // space quiet for a while
      now,
    });
    expect(result.status).toBe("fresh");
    expect(result.autoDowngraded).toBe(false);
  });
});
