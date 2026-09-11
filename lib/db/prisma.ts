import { PrismaClient } from "@prisma/client";

// Стандартный паттерн для Next.js dev — один PrismaClient на процесс,
// чтобы hot-reload не плодил новые подключения к базе.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
