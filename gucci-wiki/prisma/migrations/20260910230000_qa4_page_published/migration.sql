-- QA-прогон 4: признак «опубликовано» становится колонкой вместо сравнения
-- всего HTML статьи со строкой-заглушкой.
--
-- Бэкафилл повторяет ровно тот предикат, который использовался в коде до
-- этой миграции (`content <> '<p></p>'`), чтобы ни одна уже существующая
-- статья не поменяла видимость: что считалось опубликованным — таким и
-- останется.
ALTER TABLE "Page" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Page" SET "published" = ("content" <> '<p></p>');

CREATE INDEX "Page_spaceId_published_idx" ON "Page"("spaceId", "published");
