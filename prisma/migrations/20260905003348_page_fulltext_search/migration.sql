-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "searchVector" tsvector;

-- CreateIndex
CREATE INDEX "Page_searchVector_idx" ON "Page" USING GIN ("searchVector");

-- Поиск (кусок 3): searchText/searchVector поддерживаются в БД, а не в
-- app-коде — так индекс не может рассинхронизироваться с content статьи
-- независимо от того, кто и как её сохранил (actions.ts, seed, будущий
-- импорт и т.д.), без отдельного хука переиндексации в каждом месте записи.

-- gucci_strip_html: грубый, но immutable стриппер HTML для полнотекстового
-- поиска — закрывающие блочные теги и <br> становятся переводом строки
-- (нужно для разбиения на абзацы при цитировании), остальные теги вырезаются,
-- базовые сущности разворачиваются. Не парсер HTML — известный потолок:
-- вложенные/битые теги и редкие сущности не обрабатываются, для контента
-- Tiptap (p/h1-h6/li/blockquote/br) этого достаточно.
CREATE OR REPLACE FUNCTION gucci_strip_html(input text) RETURNS text AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(input, ''), '</(p|h1|h2|h3|h4|h5|h6|li|blockquote|pre|div)>|<br\s*/?>', E'\n', 'gi'),
        '<[^>]+>', ' ', 'g'
      ),
      '&nbsp;', ' ', 'g'
    ),
    '&amp;|&lt;|&gt;|&quot;|&#39;',
    ' ',
    'g'
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION gucci_page_search_sync() RETURNS trigger AS $$
BEGIN
  NEW."searchText" := regexp_replace(
    gucci_strip_html(coalesce(NEW.title, '') || E'\n' || coalesce(NEW.content, '')),
    '[ \t]+', ' ', 'g'
  );
  NEW."searchVector" := to_tsvector('russian', NEW."searchText");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER page_search_sync
BEFORE INSERT OR UPDATE OF title, content ON "Page"
FOR EACH ROW EXECUTE FUNCTION gucci_page_search_sync();

-- Бэкафилл для статей, уже существовавших до этой миграции (триггер выше
-- срабатывает только на будущие INSERT/UPDATE).
UPDATE "Page" SET
  "searchText" = regexp_replace(
    gucci_strip_html(coalesce(title, '') || E'\n' || coalesce(content, '')),
    '[ \t]+', ' ', 'g'
  );
UPDATE "Page" SET "searchVector" = to_tsvector('russian', "searchText");
