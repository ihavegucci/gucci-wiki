-- QA-прогон 3: индексы под сортировки, которые реально выполняются в коде,
-- но шли через сортировку всей таблицы в памяти.
--
-- Page.updatedAt  — «последние изменения» на главной (orderBy updatedAt DESC LIMIT n)
-- Page.viewCount  — «популярные» на главной (orderBy viewCount DESC LIMIT n)
-- Notification(userId, createdAt) — список уведомлений пользователя (orderBy createdAt DESC);
--                                   существующий (userId, read) это не покрывает
-- FileItem(folderId, createdAt)   — файлы внутри папки (orderBy createdAt);
--                                   существующий (folderId) покрывает только фильтр
--
-- CREATE INDEX без CONCURRENTLY: таблицы небольшие (self-hosted вика на
-- 5-50 человек), а CONCURRENTLY нельзя выполнять внутри транзакции, в
-- которой prisma migrate deploy прогоняет миграцию.
CREATE INDEX "Page_updatedAt_idx" ON "Page"("updatedAt");
CREATE INDEX "Page_viewCount_idx" ON "Page"("viewCount");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "FileItem_folderId_createdAt_idx" ON "FileItem"("folderId", "createdAt");
