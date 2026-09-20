import { prisma } from "@/lib/db/prisma";
import { generateActivationToken } from "@/lib/telegram/token";

// Гарантирует, что у пользователя есть персональный токен активации —
// создаёт при первом обращении (страница /notifications), дальше просто
// отдаёт тот же токен, ссылка не меняется между визитами.
export async function ensureActivationToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { telegramActivationToken: true },
  });
  if (user.telegramActivationToken) return user.telegramActivationToken;

  const token = generateActivationToken();
  await prisma.user.update({ where: { id: userId }, data: { telegramActivationToken: token } });
  return token;
}

// Вызывается вебхуком на "/start <token>" от бота — привязывает chat_id
// к владельцу токена. Токен одноразовый: после успешной активации
// обнуляется, повторный /start с тем же токеном ничего не найдёт (иначе
// утёкший/пересланный deep-link позволял бы в любой момент перехватить
// чужие уведомления, перепривязав chat_id на себя).
//
// updateMany с условием на сам токен (не findUnique+update по id) —
// иначе два параллельных вебхук-запроса с одним и тем же токеном оба
// проходят проверку "find" до того, как любой из них успевает обнулить
// токен, и оба активируются. updateMany атомарно совпадает только для
// того запроса, который увидит токен ещё не обнулённым.
//
// Отдельный случай — chatId, уже привязанный к другому аккаунту:
// telegramChatId в схеме @unique, поэтому запись падает на P2002. Раньше
// это исключение ловил общий catch вебхука и просто писало в лог, а
// человек в Telegram не получал ВООБЩЕ ничего в ответ на /start: ни
// успеха, ни ошибки. Токен при этом оставался неизрасходованным, но
// узнать об этом было неоткуда, и попытки повторялись по кругу. Теперь
// отличаем этот случай явно, чтобы вебхук мог ответить понятным текстом.
export type ActivationResult =
  | { status: "ok"; user: { name: string } }
  | { status: "not-found" }
  | { status: "chat-taken" };

export async function activateByToken(token: string, chatId: string): Promise<ActivationResult> {
  try {
    const result = await prisma.user.updateMany({
      where: { telegramActivationToken: token },
      data: { telegramChatId: chatId, telegramActivatedAt: new Date(), telegramActivationToken: null },
    });
    if (result.count === 0) return { status: "not-found" };
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { status: "chat-taken" };
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { name: true },
  });
  return user ? { status: "ok", user } : { status: "not-found" };
}
