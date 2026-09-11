import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !name || password.length < 8) {
    return NextResponse.json(
      { error: "Укажите имя, email и пароль (минимум 8 символов)." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует." }, { status: 409 });
  }

  // Первый зарегистрированный пользователь становится администратором —
  // так у self-hosted инстанса есть кому настраивать /settings из коробки.
  // Он же единственный, кто получает сессию сразу — все остальные ждут
  // подтверждения админом в /admin/users (кусок 2).
  //
  // Любой следующий саморегистрирующийся — VIEWER, не EDITOR (нашла слепая
  // проверка G3): без этого кто угодно, дошедший до /register, тут же
  // получал права редактирования/загрузки файлов без ведома админа.
  // Роль можно сменить позже в /admin/users (кусок 2).
  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: isFirstUser ? "ADMIN" : "VIEWER",
      // Явно, хотя ACTIVE/PENDING и так дефолт схемы для второй ветки —
      // для ясности на месте, а не только в комментарии к схеме.
      status: isFirstUser ? "ACTIVE" : "PENDING",
    },
  });

  if (!isFirstUser) {
    // PENDING не получает сессию: полу-авторизованный пользователь иначе
    // бродит по интерфейсу до отказа на каждом отдельном действии.
    return NextResponse.json({
      pending: true,
      message: "Заявка отправлена. Администратор должен подтвердить доступ.",
    });
  }

  // Демо-пространства создаёт сид при первом старте контейнера, когда
  // пользователей ещё нет вообще — владельца им поставить неоткуда. А без
  // владельца не работает эскалация свежести: если автор статьи пропал на
  // месяц, напомнить о ней оказывается некому, и уведомление просто не
  // создаётся. Первый зарегистрировавшийся — это админ инстанса, он и
  // становится владельцем всех бесхозных пространств.
  //
  // updateMany по условию ownerId: null — трогает только бесхозные, уже
  // назначенных владельцев не перезаписывает.
  await prisma.space.updateMany({ where: { ownerId: null }, data: { ownerId: user.id } });

  await setSessionCookie({ uid: user.id, role: user.role });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}
