"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "@/components/ui/useAnchoredPanel";
import { Cloud, Send, CheckCircle2, XCircle, Loader2, Image as ImageIcon, X, DatabaseBackup, Download, Link2, HelpCircle } from "lucide-react";
import type { PublicSettings } from "@/lib/settings/settings";
import { COMPANY_NAME_MAX_LENGTH } from "@/lib/settings/settings";
import type { BackupObjectInfo } from "@/lib/storage/s3";
import { xhrUpload, UploadAbortedError } from "@/lib/upload/xhrUpload";
import UploadProgress, { type UploadState } from "@/components/ui/UploadProgress";

// Дата в состоянии клиента — всегда строка (ISO): initialBackupItems
// приходит с сервера как настоящий Date (RSC-сериализация это умеет), а
// после PUT /settings/backup — уже строкой из JSON.parse. Приводим к одному
// виду один раз, а не гадаем при каждом рендере, что за тип пришёл.
type BackupItem = Omit<BackupObjectInfo, "lastModified"> & { lastModified: string };

type TestState = { status: "idle" | "checking" | "ok" | "error"; message?: string };

const IDLE: TestState = { status: "idle" };

// Подписка-заглушка для useSyncExternalStore ниже: внешнего источника нет,
// нужен только сам факт «мы уже на клиенте». Вынесена из компонента, чтобы
// ссылка была стабильной между рендерами.
const subscribeNothing = () => () => {};

function ResultBadge({ state, checkingLabel = "Проверяем..." }: { state: TestState; checkingLabel?: string }) {
  if (state.status === "idle") return null;
  if (state.status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
        <Loader2 size={14} className="animate-spin" /> {checkingLabel}
      </span>
    );
  }
  if (state.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 size={14} /> {state.message ?? "Соединение установлено"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
      <XCircle size={14} /> {state.message ?? "Не удалось подключиться"}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  maxLength?: number;
}) {
  // Поля рендерятся списком с одинаковыми пропсами — своего стабильного
  // ключа для id нет, поэтому useId (label-for работает и без него только
  // при обёртке input в label, а тут разметка с отдельным label).
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-neutral-700">{label}</label>
        {maxLength !== undefined && (
          <span className="text-xs text-neutral-400">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <input
        id={id}
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  // Раскрытие и по клику, и по наведению: на тач-устройствах hover не
  // наступает вообще, и подсказка была бы недостижима.
  //
  // Позиция считается и зажимается в границы окна, панель рисуется порталом —
  // как у колокольчика, бейджа свежести и подсказки в шапке. Привязка к краю
  // кнопки (здесь была `left-0`) на узком экране выносит панель за границу:
  // иконка стоит после заголовка блока, и 288px вправо от неё на телефоне уже
  // не помещаются.
  const [open, setOpen] = useState(false);
  const { anchorRef, rect } = useAnchoredPanel<HTMLDivElement>(open, () => setOpen(false), 288);

  return (
    <div
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Подробнее"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
      >
        <HelpCircle size={15} />
      </button>
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="z-50 rounded-xl border border-neutral-200 bg-white px-3.5 pb-3 pt-3 text-sm text-neutral-600 shadow-lg"
          >
            {text}
          </div>,
          document.body
        )}
    </div>
  );
}

// items приходит как проп с сервера (app/settings/page.tsx), а не только
// через GET /settings/backup — источник истины сам бакет, не БД, поэтому
// страница открывается сразу со списком, без лишнего клиентского запроса.
export default function SettingsForm({
  initial,
  initialBackupItems,
}: {
  initial: PublicSettings;
  initialBackupItems: BackupObjectInfo[];
}) {
  const [s3Endpoint, setS3Endpoint] = useState(initial.s3.endpoint);
  const [s3Bucket, setS3Bucket] = useState(initial.s3.bucket);
  const [s3Region, setS3Region] = useState(initial.s3.region);
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [companyName, setCompanyName] = useState(initial.personalization.companyName);

  const [accessKeyConfigured, setAccessKeyConfigured] = useState(initial.s3.accessKeyConfigured);
  const [secretKeyConfigured, setSecretKeyConfigured] = useState(initial.s3.secretKeyConfigured);
  const [botTokenConfigured, setBotTokenConfigured] = useState(initial.telegram.botTokenConfigured);
  const [logoUrl, setLogoUrl] = useState(initial.personalization.logoUrl);

  // Каждый блок сохраняется своей кнопкой, не общей внизу страницы — у S3 и
  // Telegram эта кнопка активна только после успешной «Проверить» для
  // текущих значений полей (s3Checked/telegramChecked), поэтому любая
  // правка полей блока сбрасывает и тест, и этот флаг (см. invalidateS3/
  // invalidateTelegram ниже) — иначе «активна после проверки» переставало
  // бы быть правдой после первой же правки поля.
  const [s3Test, setS3Test] = useState<TestState>(IDLE);
  const [s3Checked, setS3Checked] = useState(false);
  const [s3Saving, setS3Saving] = useState(false);
  const [s3SaveState, setS3SaveState] = useState<TestState>(IDLE);

  const [telegramTest, setTelegramTest] = useState<TestState>(IDLE);
  const [telegramChecked, setTelegramChecked] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramSaveState, setTelegramSaveState] = useState<TestState>(IDLE);

  // У «Персонализации» нет «Проверить» — кнопка «Сохранить» там гейтится
  // не проверкой, а тем, отличается ли название компании от последнего
  // сохранённого (initialCompanyName, обновляется после успешного
  // сохранения). Логотип сохраняется сам по себе при загрузке — своей
  // кнопки «Сохранить» не требует.
  const [initialCompanyName, setInitialCompanyName] = useState(initial.personalization.companyName);
  const [personalizationSaving, setPersonalizationSaving] = useState(false);
  const [personalizationSaveState, setPersonalizationSaveState] = useState<TestState>(IDLE);

  const [logoState, setLogoState] = useState<TestState>(IDLE);
  const [logoProgress, setLogoProgress] = useState<UploadState | null>(null);
  const logoAbortRef = useRef<(() => void) | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [webhook, setWebhook] = useState<TestState>(IDLE);

  const [backupEnabled, setBackupEnabled] = useState(initial.backup.enabled);
  const [backupLastAt, setBackupLastAt] = useState(initial.backup.lastAt);
  const [backupLastStatus, setBackupLastStatus] = useState(initial.backup.lastStatus);
  const [backupLastError, setBackupLastError] = useState(initial.backup.lastError);
  const [backupItems, setBackupItems] = useState<BackupItem[]>(() =>
    initialBackupItems.map((item) => ({ ...item, lastModified: new Date(item.lastModified).toISOString() }))
  );
  const [backupToggling, setBackupToggling] = useState(false);
  const [backupToggleError, setBackupToggleError] = useState<string | null>(null);

  // false на сервере, true после гидрации — штатный способ отличить одно от
  // другого без useEffect+setState (тот даёт каскадный ререндер и запрещён
  // правилом react-hooks/set-state-in-effect).
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  // Правка любого поля блока после успешной проверки обесценивает её —
  // сбрасываем и бейдж проверки, и флаг, разрешающий «Сохранить».
  function invalidateS3Check() {
    setS3Checked(false);
    setS3Test(IDLE);
    setS3SaveState(IDLE);
  }

  function invalidateTelegramCheck() {
    setTelegramChecked(false);
    setTelegramTest(IDLE);
    setTelegramSaveState(IDLE);
  }

  async function handleSaveS3() {
    setS3Saving(true);
    setS3SaveState({ status: "checking" });
    try {
      const res = await fetch("/settings/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Endpoint, s3Bucket, s3Region, s3AccessKey, s3SecretKey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setS3SaveState({ status: "error", message: data?.error ?? "Не удалось сохранить." });
        return;
      }
      const settings = data as PublicSettings;
      setAccessKeyConfigured(settings.s3.accessKeyConfigured);
      setSecretKeyConfigured(settings.s3.secretKeyConfigured);
      setS3AccessKey("");
      setS3SecretKey("");
      setS3SaveState({ status: "ok", message: "Сохранено" });
    } finally {
      setS3Saving(false);
    }
  }

  async function handleSaveTelegram() {
    setTelegramSaving(true);
    setTelegramSaveState({ status: "checking" });
    try {
      const res = await fetch("/settings/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramBotToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTelegramSaveState({ status: "error", message: data?.error ?? "Не удалось сохранить." });
        return;
      }
      const settings = data as PublicSettings;
      setBotTokenConfigured(settings.telegram.botTokenConfigured);
      setTelegramBotToken("");
      setTelegramSaveState({ status: "ok", message: "Сохранено" });
    } finally {
      setTelegramSaving(false);
    }
  }

  async function handleSavePersonalization() {
    setPersonalizationSaving(true);
    setPersonalizationSaveState({ status: "checking" });
    try {
      const res = await fetch("/settings/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPersonalizationSaveState({ status: "error", message: data?.error ?? "Не удалось сохранить." });
        return;
      }
      setInitialCompanyName(companyName);
      setPersonalizationSaveState({ status: "ok", message: "Сохранено" });
    } finally {
      setPersonalizationSaving(false);
    }
  }

  // Кнопки «Проверить» и загрузка логотипа блокируются по status === "checking",
  // поэтому реджект самого fetch (сеть/сервер недоступны) без catch оставлял их
  // задизейбленными навсегда — тот же приём, что у handleSave* выше.
  async function handleTestS3() {
    setS3Test({ status: "checking" });
    setS3SaveState(IDLE);
    try {
      const res = await fetch("/settings/test-s3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Endpoint, s3Bucket, s3Region, s3AccessKey, s3SecretKey }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setS3Test({ status: "ok" });
        setS3Checked(true);
      } else {
        setS3Test({ status: "error", message: data?.error });
        setS3Checked(false);
      }
    } catch {
      setS3Test({ status: "error", message: "Не удалось подключиться к серверу." });
      setS3Checked(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLogoState({ status: "checking" });
    setLogoProgress({ name: file.name, loaded: 0, total: file.size });
    const formData = new FormData();
    formData.append("file", file);
    try {
      const upload = xhrUpload<PublicSettings>("/settings/logo", formData, (p) =>
        setLogoProgress((prev) => prev && { ...prev, loaded: p.loaded, total: p.total })
      );
      logoAbortRef.current = upload.abort;
      const settings = await upload.promise;
      setLogoUrl(settings.personalization.logoUrl);
      setLogoState({ status: "ok", message: "Логотип сохранён" });
    } catch (err) {
      // Отмена — не ошибка: бейдж возвращается в исходное состояние.
      setLogoState(
        err instanceof UploadAbortedError
          ? IDLE
          : { status: "error", message: err instanceof Error ? err.message : "Не удалось загрузить логотип." }
      );
    } finally {
      logoAbortRef.current = null;
      setLogoProgress(null);
    }
  }

  async function handleLogoDelete() {
    setLogoState({ status: "checking" });
    try {
      const res = await fetch("/settings/logo", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLogoState({ status: "error", message: data?.error ?? "Не удалось удалить логотип." });
        return;
      }
      setLogoUrl(null);
      setLogoState(IDLE);
    } catch {
      setLogoState({ status: "error", message: "Не удалось подключиться к серверу." });
    }
  }

  async function handleTestTelegram() {
    setTelegramTest({ status: "checking" });
    setTelegramSaveState(IDLE);
    try {
      const res = await fetch("/settings/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramBotToken }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setTelegramTest({ status: "ok", message: data.botUsername ? `Бот @${data.botUsername}` : "Токен рабочий" });
        setTelegramChecked(true);
      } else {
        setTelegramTest({ status: "error", message: data?.error });
        setTelegramChecked(false);
      }
    } catch {
      setTelegramTest({ status: "error", message: "Не удалось подключиться к серверу." });
      setTelegramChecked(false);
    }
  }

  // Разовая регистрация нашего /api/telegram/webhook в Telegram — роут уже
  // admin-guarded и берёт токен бота из уже сохранённых настроек, поэтому
  // не зависит от значений полей формы выше и от их проверки/сохранения.
  async function handleRegisterWebhook() {
    setWebhook({ status: "checking" });
    const res = await fetch("/api/telegram/webhook/register", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok && data?.ok) {
      setWebhook({ status: "ok", message: `Подключено: ${data.webhookUrl}` });
    } else {
      setWebhook({ status: "error", message: data?.error ?? "Не удалось подключить webhook." });
    }
  }

  // Чекбокс сохраняется сразу по клику (тот же приём, что и логотип выше —
  // отдельным запросом, не через общий handleSave), потому что булево
  // состояние здесь не связано с текстовыми полями формы: держать его в
  // одном handleSave только ради единообразия усложнило бы оба пути без
  // пользы.
  async function handleToggleBackup(checked: boolean) {
    setBackupToggling(true);
    setBackupToggleError(null);
    try {
      const res = await fetch("/settings/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupEnabled: checked }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBackupToggleError(data?.error ?? "Не удалось сохранить.");
        return;
      }
      setBackupEnabled(data.enabled);
      setBackupLastAt(data.lastAt);
      setBackupLastStatus(data.lastStatus);
      setBackupLastError(data.lastError);
      setBackupItems(data.items ?? []);
    } finally {
      setBackupToggling(false);
    }
  }

  // toLocaleString зависит от часового пояса, а первый HTML этого клиентского
  // компонента рисует сервер (в контейнере — UTC) — расхождение с браузером
  // ломает гидрацию. Локальный формат только после монтирования, до него — ISO.
  function formatBackupDate(iso: string) {
    return mounted ? new Date(iso).toLocaleString("ru-RU") : iso;
  }

  function formatBackupSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  const s3Configured = accessKeyConfigured && secretKeyConfigured && Boolean(s3Bucket);

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2 text-neutral-900">
          <Cloud size={17} />
          <h2 className="font-semibold">S3-бакет</h2>
          <InfoTooltip
            text={
              'Для обеспечения безопасности настройте CORS в панели администратора S3: разрешите запросы ' +
              "(GET, PUT, POST) с адреса вашей вики. Без этого браузеры сотрудников будут блокировать " +
              "загрузку файлов и показ картинок из бакета как кросс-доменные запросы."
            }
          />
        </div>
        <p className="mt-1 text-sm text-neutral-500">Хранилище для файлов и картинок, вставленных в статьи.</p>

        <div className="mt-4 space-y-3">
          <Field
            label="Endpoint"
            value={s3Endpoint}
            onChange={(v) => { setS3Endpoint(v); invalidateS3Check(); }}
            placeholder="https://s3.example.com"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field
              label="Бакет"
              value={s3Bucket}
              onChange={(v) => { setS3Bucket(v); invalidateS3Check(); }}
              placeholder="my-bucket"
            />
            <Field
              label="Регион"
              value={s3Region}
              onChange={(v) => { setS3Region(v); invalidateS3Check(); }}
              placeholder="us-east-1"
            />
          </div>
          <Field
            label="Ключ доступа (Access Key)"
            value={s3AccessKey}
            onChange={(v) => { setS3AccessKey(v); invalidateS3Check(); }}
            secret
            placeholder={accessKeyConfigured ? "•••••••• (оставьте пустым, чтобы не менять)" : "Access Key ID"}
          />
          <Field
            label="Секретный ключ (Secret Key)"
            value={s3SecretKey}
            onChange={(v) => { setS3SecretKey(v); invalidateS3Check(); }}
            secret
            placeholder={secretKeyConfigured ? "•••••••• (оставьте пустым, чтобы не менять)" : "Secret Access Key"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTestS3}
            disabled={s3Test.status === "checking"}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            Проверить
          </button>
          <button
            type="button"
            onClick={handleSaveS3}
            disabled={!s3Checked || s3Saving}
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
          >
            {s3Saving ? "Сохраняем..." : "Сохранить"}
          </button>
          <ResultBadge state={s3SaveState.status !== "idle" ? s3SaveState : s3Test} />
        </div>
        {/* «Проверить» только проверяет соединение и ничего не сохраняет —
            «Сохранить» становится доступна только по её результату, и снова
            блокируется при любой правке полей выше. */}
        <p className="mt-2 text-xs text-neutral-400">
          «Проверить» не сохраняет данные. «Сохранить» станет доступна после успешной проверки.
        </p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2 text-neutral-900">
          <Send size={16} />
          <h2 className="font-semibold">Telegram-бот</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Токен бота для рассылок и оповещений сотрудникам.</p>

        <div className="mt-4">
          <Field
            label="Токен бота"
            value={telegramBotToken}
            onChange={(v) => { setTelegramBotToken(v); invalidateTelegramCheck(); }}
            secret
            placeholder={botTokenConfigured ? "•••••••• (оставьте пустым, чтобы не менять)" : "123456:ABC-DEF..."}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTestTelegram}
            disabled={telegramTest.status === "checking"}
            className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            Проверить
          </button>
          <button
            type="button"
            onClick={handleSaveTelegram}
            disabled={!telegramChecked || telegramSaving}
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
          >
            {telegramSaving ? "Сохраняем..." : "Сохранить"}
          </button>
          <ResultBadge state={telegramSaveState.status !== "idle" ? telegramSaveState : telegramTest} />
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          «Проверить» не сохраняет данные. «Сохранить» станет доступна после успешной проверки.
        </p>

        <div className="mt-5 border-t border-neutral-100 pt-5">
          <div className="flex items-center gap-2 text-neutral-900">
            <Link2 size={15} />
            <h3 className="text-sm font-semibold">Приём активаций от бота</h3>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Разово подключите webhook, чтобы бот узнавал о нажатии «Подключить Telegram» в профилях сотрудников.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleRegisterWebhook}
              disabled={webhook.status === "checking"}
              className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
            >
              Подключить webhook
            </button>
            <ResultBadge state={webhook} checkingLabel="Подключаем..." />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2 text-neutral-900">
          <ImageIcon size={17} />
          <h2 className="font-semibold">Персонализация</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Логотип и название компании — показываются в меню и на главной странице.
        </p>

        <div className="mt-4">
          <Field
            label="Название компании"
            value={companyName}
            onChange={setCompanyName}
            placeholder="ООО «Ромашка»"
            maxLength={COMPANY_NAME_MAX_LENGTH}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSavePersonalization}
              disabled={companyName === initialCompanyName || personalizationSaving}
              className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
            >
              {personalizationSaving ? "Сохраняем..." : "Сохранить"}
            </button>
            <ResultBadge state={personalizationSaveState} />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-neutral-700">Логотип</label>
          <p className="mb-2 text-xs text-neutral-400">PNG с прозрачным фоном, до 2 МБ, не более 1000×1000 px.</p>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <div className="relative flex h-16 w-16 items-center justify-center rounded-lg border border-neutral-200 bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- превью произвольного внешнего URL из S3, next/image тут не нужен */}
                <img src={logoUrl} alt="Логотип компании" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={handleLogoDelete}
                  title="Удалить логотип"
                  className="absolute -right-2 -top-2 rounded-full bg-neutral-900 p-0.5 text-white hover:bg-neutral-700"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-neutral-300">
                <ImageIcon size={22} />
              </div>
            )}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoState.status === "checking"}
              className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
            >
              {logoUrl ? "Заменить" : "Загрузить"}
            </button>
            <input ref={logoInputRef} type="file" accept="image/png" className="hidden" onChange={handleLogoChange} />
            {!logoProgress && <ResultBadge state={logoState} />}
          </div>
          {logoProgress && <UploadProgress state={logoProgress} onCancel={() => logoAbortRef.current?.()} />}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center gap-2 text-neutral-900">
          <DatabaseBackup size={17} />
          <h2 className="font-semibold">Резервное копирование БД</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Раз в сутки полный дамп базы данных загружается в S3-бакет выше. Хранятся последние 7 копий.
        </p>

        {!s3Configured ? (
          <p className="mt-4 text-sm text-neutral-400">Сначала настройте и сохраните S3-бакет выше.</p>
        ) : (
          <>
            <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={backupEnabled}
                disabled={backupToggling}
                onChange={(e) => handleToggleBackup(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 accent-neutral-900 focus:ring-neutral-400"
              />
              Включить автоматический бэкап БД
            </label>
            {backupToggleError && <p className="mt-1 text-xs text-red-600">{backupToggleError}</p>}

            <p className="mt-3 text-sm text-neutral-500">
              Последний бэкап:{" "}
              {backupLastAt ? formatBackupDate(backupLastAt) : "ещё не выполнялся"}
              {backupLastStatus === "OK" && <span className="text-emerald-600"> — успешно</span>}
              {backupLastStatus === "ERROR" && (
                <span className="text-red-600"> — ошибка: {backupLastError}</span>
              )}
            </p>

            {backupItems.length > 0 && (
              <ul className="mt-4 divide-y divide-neutral-100 text-sm">
                {backupItems.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-neutral-700">
                      {item.fileName} · {formatBackupSize(item.size)} · {formatBackupDate(item.lastModified)}
                    </span>
                    <a
                      href={`/settings/backup/download?key=${encodeURIComponent(item.key)}`}
                      className="flex shrink-0 items-center gap-1 text-neutral-500 hover:text-neutral-900"
                      title="Скачать"
                    >
                      <Download size={15} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
