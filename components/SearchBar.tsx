"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Search, FileText, Quote } from "lucide-react";
import type { SearchResponse, SearchHit } from "@/lib/search/search";

const DEBOUNCE_MS = 250;

// Безопасный рендер сниппета/цитаты вместо dangerouslySetInnerHTML.
//
// Раньше снипет/цитата вставлялись напрямую как HTML. `snippet` приходит
// от Postgres ts_headline(), которая оборачивает совпадения в <b>...</b>
// (это и есть подсветка), а `quote` — сырой абзац из searchText. Оба в
// теории должны быть безопасны, потому что HTML вырезается на входе
// (gucci_strip_html) — но эта функция режет теги регэкспом, которому
// нужен закрывающий `>`, и незакрытый/битый тег в конце текста статьи
// проходит насквозь. Слепая проверка (G3) подтвердила это как реальный
// stored XSS: такой контент долетал до `dangerouslySetInnerHTML` и
// выполнялся у любого, кто искал совпадающее слово.
//
// Правильное место чинить — граница рендера, а не (только) вход: здесь
// распознаём ТОЛЬКО буквальные `<b>`/`</b>` (ровно то, что умеет вставить
// ts_headline), всё остальное — обычный текст, который React экранирует
// сам. Так результат безопасен независимо от того, что просочилось через
// gucci_strip_html выше по цепочке.
// Чистая функция — вынесена отдельно, чтобы её можно было проверить
// юнит-тестом (test/search-highlight.test.ts) без рендера React/DOM.
export function splitHighlights(text: string): Array<{ bold: boolean; text: string }> {
  const parts = text.split(/(<b>|<\/b>)/g);
  let bold = false;
  const segments: Array<{ bold: boolean; text: string }> = [];
  for (const part of parts) {
    if (part === "<b>") { bold = true; continue; }
    if (part === "</b>") { bold = false; continue; }
    if (!part) continue;
    segments.push({ bold, text: part });
  }
  return segments;
}

function Highlighted({ text }: { text: string }) {
  const nodes: ReactNode[] = splitHighlights(text).map((seg, i) =>
    seg.bold ? <b key={i}>{seg.text}</b> : <span key={i}>{seg.text}</span>
  );
  return <>{nodes}</>;
}

// Триггер выглядит как прежний статичный инпут в Topbar (тот же класс), но
// по клику/⌘K открывает модалку с живым поиском вместо простого фокуса.
export default function SearchBar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-full max-w-md text-left"
      >
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <span className="block w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-14 text-sm text-neutral-400">
          Поиск по gucci-wiki...
        </span>
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] text-neutral-400">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && <SearchDialog onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Debounce: весь setState — внутри колбэка таймера/промиса, а не
  // синхронно в теле эффекта, иначе каждый набранный символ рендерит дважды.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => {
      if (!q) {
        setResult(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Раньше ответ разбирался сразу через .json() без проверки статуса:
      // при истёкшей сессии (401) в setResult попадал `{error:"unauthorized"}`,
      // ни одна ветка рендера под него не подходила, и диалог оставался пустым.
      // Отдельно убран .catch, подставлявший пустой список — ошибка сервера
      // выглядела как «ничего не нашлось».
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (res) => {
          if (res.status === 401) {
            setResult(null);
            setError("Сессия истекла, войдите заново.");
            return;
          }
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            setResult(null);
            setError(data?.error ?? "Не удалось выполнить поиск.");
            return;
          }
          setResult(data as SearchResponse);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") {
            setResult(null);
            setError("Не удалось подключиться к серверу.");
          }
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 px-4 pt-[12vh]"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="relative border-b border-neutral-200">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Спросите что-нибудь или найдите статью..."
            className="w-full border-none bg-transparent py-4 pl-11 pr-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() && (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">
              Начните вводить запрос — например, «как оформить возврат»
            </p>
          )}

          {query.trim() && loading && !result && !error && (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">Ищем…</p>
          )}

          {error && <p className="px-3 py-6 text-center text-sm text-red-600">{error}</p>}

          {result?.mode === "answer" && (
            <div className="mb-1 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
                <Quote size={13} />
                Точный ответ
              </div>
              <blockquote className="mt-2 text-sm leading-relaxed text-neutral-700 [&_b]:font-semibold [&_b]:text-neutral-900">
                <Highlighted text={result.quote} />
              </blockquote>
              <Link
                href={`/pages/${result.page.id}`}
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
              >
                <FileText size={12} />
                {result.page.title} · {result.page.spaceName}
              </Link>
            </div>
          )}

          {result?.mode === "answer" && result.results.length > 0 && (
            <div className="mb-1 px-3 pt-2 text-xs font-medium text-neutral-400">Также нашлось</div>
          )}

          {(result?.mode === "list" ? result.results : result?.mode === "answer" ? result.results : []).map((hit) => (
            <ResultRow key={hit.id} hit={hit} onClick={onClose} />
          ))}

          {result?.mode === "list" && result.results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-neutral-400">Ничего не нашлось</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultRow({ hit, onClick }: { hit: SearchHit; onClick: () => void }) {
  return (
    <Link
      href={`/pages/${hit.id}`}
      onClick={onClick}
      className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-neutral-50"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
        <FileText size={14} className="shrink-0 text-neutral-400" />
        {hit.title}
      </div>
      <div className="pl-[20px] text-xs text-neutral-400">{hit.spaceName}</div>
      <p className="mt-0.5 line-clamp-2 pl-[20px] text-xs text-neutral-500 [&_b]:font-semibold [&_b]:text-neutral-700">
        <Highlighted text={hit.snippet} />
      </p>
    </Link>
  );
}
