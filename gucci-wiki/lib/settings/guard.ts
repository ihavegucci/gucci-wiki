import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

// Настройки — только Admin. Проверка на уровне API-роута (не только
// скрытием ссылки в интерфейсе): каждый роут в app/settings/*/route.ts
// вызывает это перед любым чтением/записью.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return { user: null, response: NextResponse.json({ error: "Доступ запрещён." }, { status: 403 }) };
  }
  return { user, response: null };
}
