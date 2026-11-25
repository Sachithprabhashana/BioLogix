import { Request, Response } from "express";
import { prisma } from "../config/prisma";

// POST /api/attendance/check-in - Record an employee attendance log
export const checkIn = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            employeeCode,
            userId,
            latitude,
            longitude,
            confidenceScore,
            status,
            isOfflineSync,
            checkInTime,
        } = req.body;

        if (!employeeCode && !userId) {
            res.status(400).json({
                status: "error",
                message: "Either employeeCode or userId is required.",
            });
            return;
        }

        // Look up the user by userId or employeeCode
        const user = await prisma.user.findFirst({
            where: userId ? { id: userId } : { employeeCode },
        });

        if (!user) {
            res.status(404).json({
                status: "error",
                message: "Employee not found.",
            });
            return;
        }

        const validStatuses = ["VERIFIED", "FLAGGED", "OFFLINE_QUEUED"] as const;
        const resolvedStatus = validStatuses.includes(status) ? status : "VERIFIED";

        const log = await prisma.attendanceLog.create({
            data: {
                userId: user.id,
                latitude: typeof latitude === "number" ? latitude : null,
                longitude: typeof longitude === "number" ? longitude : null,
                confidenceScore: typeof confidenceScore === "number" ? confidenceScore : null,
                status: resolvedStatus,
                isOfflineSync: Boolean(isOfflineSync),
                ...(checkInTime ? { checkInTime: new Date(checkInTime) } : {}),
                ...(isOfflineSync ? { syncedAt: new Date() } : {}),
            },
            include: {
                user: {
                    select: {
                        employeeCode: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
        });

        res.status(201).json({
            status: "ok",
            data: log,
        });
    } catch (error) {
        console.error("Error recording check-in:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to record attendance check-in.",
        });
    }
};

// GET /api/attendance - Fetch all attendance logs
export const getAttendanceLogs = async (_req: Request, res: Response): Promise<void> => {
    try {
        const logs = await prisma.attendanceLog.findMany({
            orderBy: { checkInTime: "desc" },
            include: {
                user: {
                    select: {
                        id: true,
                        employeeCode: true,
                        fullName: true,
                        role: true,
                    },
                },
            },
        });

        res.json({
            status: "ok",
            count: logs.length,
            data: logs,
        });
    } catch (error) {
        console.error("Error fetching attendance logs:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch attendance logs.",
        });
    }
};