import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";

// Хэш-заглушка для несуществующего email: bcrypt.compare с ним стоит
// столько же времени, сколько с настоящим хэшем. Без этого ответ на
// "email не найден" был бы заметно быстрее ответа на "неверный пароль" —
// тайминг-канал, по которому можно перебором узнать, какие email вообще
// зарегистрированы. Считается один раз на процесс, не на каждый логин.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword("gucci-wiki-timing-safety-placeholder");
  return dummyHash;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const invalid = () =>
    NextResponse.json({ error: "Неверный email или пароль." }, { status: 401 });

  if (!email || !password) return invalid();

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return invalid();

  // Регистрация с подтверждением (кусок 1): пока админ не подтвердил заявку
  // в /admin/users (кусок 2), сессию не выдаём даже при верном пароле.
  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Аккаунт ещё не подтверждён администратором." },
      { status: 403 }
    );
  }

  await setSessionCookie({ uid: user.id, role: user.role });
  // Свежесть статей (кусок 4): lastActiveAt — сигнал "автор ещё пользуется
  // продуктом", по нему решаем, эскалировать ли напоминание владельцу
  // пространства. Не блокируем ответ логина её ошибкой.
  prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});

  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
