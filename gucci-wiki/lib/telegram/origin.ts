import { headers } from "next/headers";

// Свой origin для абсолютных ссылок в Telegram-сообщениях (они уходят за
// пределы приложения, относительные пути там бесполезны).
//
// Почему не берётся x-forwarded-host (QA-прогон 3): этот заголовок ставит
// клиент, а nginx в шаблонах проекта его не перетирает (там задаются
// только Host, X-Forwarded-For и X-Forwarded-Proto) — то есть клиентское
// значение доходило до приложения как есть и имело приоритет над Host.
// Редактор, сохраняя первую версию статьи запросом с
// `X-Forwarded-Host: evil.example`, рассылал всем сотрудникам, у кого
// подключён бот, сообщение «Новая статья» со ссылкой на чужой домен —
// фишинг из доверенного канала компании. Тем же путём можно было
// зарегистрировать вебхук Telegram на чужой адрес.
//
// APP_ORIGIN (например, https://wiki.example.com) — авторитетный источник,
// если задан: он не зависит ни от одного заголовка запроса. Без него
// берётся Host, который для запроса через nginx равен server_name.
export async function currentOrigin(): Promise<string | null> {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
