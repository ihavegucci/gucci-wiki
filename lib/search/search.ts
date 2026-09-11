// Поиск с ответом (C) — Postgres full-text search, без LLM/эмбеддингов
// (G06/R06). Индекс — колонки Page.searchText/searchVector, поддерживаются
// триггером в БД (миграция 20260905003348_page_fulltext_search), а не здесь:
// любой INSERT/UPDATE title или content — в actions.ts, seed-скрипте, где
// угодно — сразу переиндексируется, дополнительный хук на запись не нужен.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// Порог уверенности по ts_rank (G02.5): выше — точная цитата-абзац, ниже —
// обычный список. Подобран вручную на выдуманных примерах (см. .gucci/plan.md,
// кусок 3): многословный запрос, реально описанный в статье, даёт ~0.43;
// общее однословное совпадение — ~0.08-0.10. Известный потолок: не
// адаптивный порог, может ошибаться на нетипичных по длине статьях —
// тюнится через SEARCH_CONFIDENCE_THRESHOLD, не переусложняем нормализацией.
const CONFIDENCE_THRESHOLD = Number(process.env.SEARCH_CONFIDENCE_THRESHOLD ?? 0.2);
const MAX_RESULTS = 8;
const TS_CONFIG = "russian";

export type SearchHit = {
  id: string;
  title: string;
  spaceName: string;
  spaceSlug: string;
  snippet: string;
  rank: number;
};

export type SearchResponse =
  | { mode: "empty" }
  | { mode: "list"; results: SearchHit[] }
  | {
      mode: "answer";
      page: { id: string; title: string; spaceName: string; spaceSlug: string };
      quote: string;
      rank: number;
      results: SearchHit[];
    };

type Row = {
  id: string;
  title: string;
  spaceName: string;
  spaceSlug: string;
  searchText: string;
  rank: number;
  snippet: string;
};

// websearch_to_tsquery понимает обычный человеческий запрос как есть
// ("оформить возврат", кавычки для точной фразы, "-слово" для исключения) —
// не нужно самим собирать tsquery.
export async function search(rawQuery: string): Promise<SearchResponse> {
  const q = rawQuery.trim();
  if (!q) return { mode: "empty" };

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      p.id,
      p.title,
      s.name AS "spaceName",
      s.slug AS "spaceSlug",
      p."searchText",
      ts_rank(p."searchVector", websearch_to_tsquery(${TS_CONFIG}::regconfig, ${q})) AS rank,
      ts_headline(
        ${TS_CONFIG}::regconfig, p."searchText", websearch_to_tsquery(${TS_CONFIG}::regconfig, ${q}),
        'MaxWords=40,MinWords=15,ShortWord=3,MaxFragments=1'
      ) AS snippet
    FROM "Page" p
    JOIN "Space" s ON s.id = p."spaceId"
    WHERE p."searchVector" @@ websearch_to_tsquery(${TS_CONFIG}::regconfig, ${q})
    ORDER BY rank DESC
    LIMIT ${MAX_RESULTS}
  `);

  if (rows.length === 0) return { mode: "list", results: [] };

  const results = rows.map(toHit);
  const top = rows[0];

  if (top.rank < CONFIDENCE_THRESHOLD) {
    return { mode: "list", results };
  }

  const quote = await bestParagraph(top.id, q);
  if (!quote) return { mode: "list", results };

  return {
    mode: "answer",
    page: { id: top.id, title: top.title, spaceName: top.spaceName, spaceSlug: top.spaceSlug },
    quote,
    rank: top.rank,
    results: results.slice(1),
  };
}

function toHit(row: Row): SearchHit {
  return {
    id: row.id,
    title: row.title,
    spaceName: row.spaceName,
    spaceSlug: row.spaceSlug,
    snippet: flatten(row.snippet),
    rank: row.rank,
  };
}

function flatten(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").replace(/ {2,}/g, " ").trim();
}

// Абзац-цитата (G02.4): searchText уже хранит статью построчно (каждый
// исходный блок — своя строка, см. gucci_strip_html в миграции), так что
// разбивать HTML тут не нужно — просто ранжируем строки статьи тем же
// tsquery и берём лучшую. При равном ранге предпочитаем более длинный
// абзац — иначе иногда выигрывает голый заголовок вместо содержательного текста.
async function bestParagraph(pageId: string, q: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ para: string; rank: number }>>(Prisma.sql`
    SELECT para, ts_rank(to_tsvector(${TS_CONFIG}::regconfig, para), websearch_to_tsquery(${TS_CONFIG}::regconfig, ${q})) AS rank
    FROM "Page" p, unnest(string_to_array(p."searchText", E'\n')) AS para
    WHERE p.id = ${pageId} AND length(trim(para)) > 1
    ORDER BY rank DESC, length(para) DESC
    LIMIT 1
  `);
  const best = rows[0];
  if (!best || best.rank <= 0) return null;
  return best.para.trim();
}
