// Свежесть статьи (G02.1/G02.3): чистая функция без обращений к БД, чтобы
// статус свежести было легко покрыть тестом и переиспользовать и на странице
// статьи, и в "кроне" пересчёта (app/api/freshness/recalculate).

export type FreshnessStatus = "fresh" | "warn" | "expired";

export type FreshnessResult = {
  status: FreshnessStatus;
  daysSinceReview: number;
  /** true, если статус понижен раньше TTL автосигналом низкой посещаемости. */
  autoDowngraded: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Доля TTL, после которой статья переходит в "пора проверить", ещё не
// просрочившись формально. Число подобрано на глаз ("разумный порог"),
// не выведено из данных — известный потолок простоты.
const WARN_RATIO = 0.66;

// Автосигнал (G02.1): если в пространстве недавно правили другие статьи
// (значит, тема живая), а эту статью давно не открывали — это подозрительно
// рано указывает на то, что она могла устареть, даже если TTL ещё не истёк.
export const SPACE_ACTIVITY_WINDOW_DAYS = 14;
export const STALE_VIEW_WINDOW_DAYS = 21;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function computeFreshness(params: {
  reviewIntervalDays: number;
  lastReviewedAt: Date;
  lastViewedAt: Date | null;
  createdAt: Date;
  /** Максимальный updatedAt среди ДРУГИХ статей того же пространства. */
  spaceLastEditedAt: Date | null;
  now?: Date;
}): FreshnessResult {
  const now = params.now ?? new Date();
  const ttl = Math.max(1, params.reviewIntervalDays);
  const daysSinceReview = daysBetween(params.lastReviewedAt, now);

  let status: FreshnessStatus;
  if (daysSinceReview > ttl) status = "expired";
  else if (daysSinceReview / ttl >= WARN_RATIO) status = "warn";
  else status = "fresh";

  let autoDowngraded = false;
  if (status === "fresh") {
    const lastSeen = params.lastViewedAt ?? params.createdAt;
    const daysSinceView = daysBetween(lastSeen, now);
    const spaceActiveRecently =
      params.spaceLastEditedAt != null &&
      daysBetween(params.spaceLastEditedAt, now) <= SPACE_ACTIVITY_WINDOW_DAYS;

    if (spaceActiveRecently && daysSinceView >= STALE_VIEW_WINDOW_DAYS) {
      status = "warn";
      autoDowngraded = true;
    }
  }

  return { status, daysSinceReview, autoDowngraded };
}

// Только текст: эмодзи в проекте не используются нигде — в интерфейсе их
// место занимают иконки lucide, а в тексте (уведомления, сообщения бота)
// они не нужны вовсе.
export const FRESHNESS_LABELS: Record<FreshnessStatus, string> = {
  fresh: "Свежая",
  warn: "Пора проверить",
  expired: "Просрочена",
};
