import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

const createPrismaClient = () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is missing in server/.env");
    }

    const pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
    });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        adapter,
        log: ["error", "warn"],
    });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}