import { createHmac, timingSafeEqual } from "crypto";
import type { Role } from "@prisma/client";

// Подписанный токен сессии: base64url(payload).hmac — без внешних
// библиотек (jose/iron-session), достаточно для email+пароль сессии.
// Отделено от session.ts (который трогает next/headers), чтобы это
// было тестируемо в чистом Node-окружении.

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-insecure-session-secret";
  }
  throw new Error("SESSION_SECRET не задан");
}

export type SessionPayload = {
  uid: string;
  role: Role;
  exp: number;
};

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + MAX_AGE_MS };
  const data = base64url(JSON.stringify(full));
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_MS / 1000;
