import crypto from "node:crypto";

// Персональный токен активации бота — случайная строка, без внешних
// зависимостей (node:crypto уже есть в рантайме).
export function generateActivationToken(): string {
  return crypto.randomBytes(24).toString("hex");
}
