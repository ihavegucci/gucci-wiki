import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/freshness/notifications";

// Данные для колокольчика в топбаре (components/notifications/NotificationBell.tsx).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

  const [items, unreadCount] = await Promise.all([listNotifications(user.id), countUnread(user.id)]);
  return NextResponse.json({ items, unreadCount });
}

// Пометка прочтения: { id } — одно уведомление, { all: true } — все.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.all === true) {
    await markAllNotificationsRead(user.id);
  } else if (typeof body?.id === "string" && body.id) {
    await markNotificationRead(body.id, user.id);
  } else {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
