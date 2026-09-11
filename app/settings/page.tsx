import { Settings as SettingsIcon } from "lucide-react";
import { getSettings, toPublicSettings } from "@/lib/settings/settings";
import { listBackups } from "@/lib/storage/s3";
import SettingsForm from "@/app/settings/SettingsForm";

export default async function SettingsPage() {
  const initial = toPublicSettings(await getSettings());
  // Список бэкапов живёт в бакете, не в БД — грузится здесь же, чтобы
  // страница открывалась сразу с готовым списком, без отдельного
  // клиентского запроса на каждый визит.
  const backups = await listBackups();
  const initialBackupItems = backups.ok ? backups.items : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <SettingsIcon size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Настройки</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        S3-бакет, Telegram-бот и оформление вики — настраиваются здесь, без правки конфигов на сервере.
      </p>

      <SettingsForm initial={initial} initialBackupItems={initialBackupItems} />
    </div>
  );
}
