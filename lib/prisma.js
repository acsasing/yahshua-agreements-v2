import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton — avoids exhausting the connection
// pool from hot-reload creating a new PrismaClient on every edit.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
