-- Кусок 5 (сквозной аудит схемы Prisma) — QA-прогон 2026-09-05.

-- 1. User.email: @unique уже создаёт уникальный индекс на то же поле,
-- отдельный @@index([email]) был дублирующим (лишняя запись на каждый
-- insert/update без пользы для чтения).
DROP INDEX "User_email_idx";

-- 2. User.role: дефолт схемы был EDITOR — "fail-open" на случай будущего
-- пути создания пользователя без явно указанной роли. Единственный
-- сегодняшний путь (регистрация) роль указывает явно, так что смена
-- дефолта ничего не меняет для существующих строк, только для гипотетических
-- будущих INSERT без явной роли.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- 3. Question.authorId: было NOT NULL + ON DELETE CASCADE — удаление автора
-- стирало вопрос целиком, теряя историю обращений. Приведено к тому же
-- паттерну, что Page/Roadmap/FileItem: автор обнуляется, вопрос остаётся.
ALTER TABLE "Question" DROP CONSTRAINT "Question_authorId_fkey";
ALTER TABLE "Question" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. FileFolder: getOrCreateUnsortedFolder() (lib/files/actions.ts) искал
-- корневую папку "Нераспределённое" через findFirst+create без атомарности —
-- под гонкой двух одновременных первых загрузок могли создаться два
-- одинаковых корня. Обычный @@unique([parentId, name]) здесь не спас бы:
-- Postgres считает NULL "parentId" отличным от любого другого NULL, так что
-- уникальность по (NULL, name) не сработала бы именно в этом случае. Нужен
-- частичный индекс, не выразимый в schema.prisma напрямую (тот же класс
-- ограничения, что уже решался raw SQL в миграции полнотекстового поиска).
CREATE UNIQUE INDEX "FileFolder_root_name_key" ON "FileFolder" ("name") WHERE "parentId" IS NULL;
