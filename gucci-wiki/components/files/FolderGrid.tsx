import FolderCard from "@/components/files/FolderCard";

type FolderRow = { id: string; name: string };

// Папки, вынесены из FileGrid отдельным компонентом — правка пользователя:
// на экране «Файлы» папки и коллекции должны идти отдельными подписанными
// секциями («Папки», «Коллекции»), а не одной общей сеткой с файлами.
//
// Сетка остаётся серверной, а карточка — клиентская (FolderCard): ей нужно
// собственное состояние для инлайн-переименования.
export default function FolderGrid({ folders, canEdit }: { folders: FolderRow[]; canEdit: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {folders.map((folder) => (
        <FolderCard key={folder.id} folder={folder} canEdit={canEdit} />
      ))}
    </div>
  );
}
