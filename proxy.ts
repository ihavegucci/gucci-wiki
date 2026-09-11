import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { verifySessionToken } from "@/lib/auth/token";

const PUBLIC_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (!session && !isPublicPath) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Владельца валидного токена на /login и /register больше НЕ уводим на
  // "/" — здесь раньше стоял безусловный редирект, и он давал бесконечную
  // петлю у пользователя, за токеном которого уже нет живого аккаунта
  // (админ удалил его или снял статус ACTIVE). Проверка здесь идёт только
  // по подписи (в БД proxy не ходит), а layout судит по getCurrentUser()
  // из БД: layout отправлял на /login, proxy видел валидную подпись и
  // отправлял обратно на "/" — и так до ERR_TOO_MANY_REDIRECTS. Дойти до
  // формы входа было нельзя вообще, а выйти — тем более (logout это POST,
  // из адресной строки не вызвать), то есть человек оставался заперт до
  // ручной чистки cookie или до конца 30-дневного срока токена. Теперь
  // страница входа просто показывается: успешный вход перезапишет cookie,
  // и петля не возникает ни при каком состоянии аккаунта.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
