import FilesPageContent from "./FilesPageContent";

// Номер страницы приходит из адреса (?page=N) — «показать ещё» просто ведёт
// на следующую, состояние в клиенте не нужно.
export default async function FilesRootPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <FilesPageContent folderId={null} page={Number(page) || 1} />;
}
