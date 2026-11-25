import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./config/prisma";
import userRoutes from "./routes/userRoutes";
import attendanceRoutes from "./routes/attendanceRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health checks
app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "BioLogix Server" });
});

app.get("/health/db", async (_req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: "ok", db: "connected" });
    } catch (error) {
        res.status(500).json({ status: "error", message: String(error) });
    }
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});