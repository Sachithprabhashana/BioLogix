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


export async function verifyCheckIn(req: Request, res: Response) {
    try {
        const { employeeCode, latitude, longitude } = req.body as {
            employeeCode?: string
            latitude?: string | number
            longitude?: string | number
        }

        if (!employeeCode) {
            return res.status(400).json({
                status: 'error',
                message: 'employeeCode is required',
            })
        }

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'image file is required',
            })
        }

        const user = await prisma.user.findUnique({
            where: { employeeCode },
        })

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: `User with employeeCode ${employeeCode} not found`,
            })
        }

        const formData = new FormData()
        const blob = new Blob([new Uint8Array(req.file.buffer)], {
            type: req.file.mimetype || 'image/jpeg',
        })
        formData.append('image', blob, req.file.originalname || 'check-in.jpg')

        const aiResponse = await fetch('http://127.0.0.1:5001/verify-face', {
            method: 'POST',
            body: formData,
        })

        const aiResult = (await aiResponse.json()) as {
            status?: string
            message?: string
            confidenceScore?: number
            suggestedStatus?: string
        }

        if (!aiResponse.ok || aiResult.status === 'error') {
            return res.status(502).json({
                status: 'error',
                message: aiResult.message || 'AI service failed to verify image',
            })
        }

        const confidenceScore =
            typeof aiResult.confidenceScore === 'number' ? aiResult.confidenceScore : 0.5
        const attendanceStatus =
            aiResult.suggestedStatus === 'VERIFIED' ? 'VERIFIED' : 'REVIEW'

        const parsedLat =
            latitude !== undefined && latitude !== '' ? Number(latitude) : 6.7951
        const parsedLng =
            longitude !== undefined && longitude !== '' ? Number(longitude) : 79.9009

        const log = await prisma.attendanceLog.create({
            data: {
                userId: user.id,
                latitude: Number.isFinite(parsedLat) ? parsedLat : null,
                longitude: Number.isFinite(parsedLng) ? parsedLng : null,
                confidenceScore,
                status: attendanceStatus,
                isOfflineSync: false,
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
        })

        return res.status(201).json({
            status: 'ok',
            ai: aiResult,
            data: log,
        })
    } catch (error) {
        console.error('verifyCheckIn error:', error)
        return res.status(500).json({
            status: 'error',
            message: 'Failed to process AI attendance check-in',
        })
    }
}

export const checkOut = async (req: Request, res: Response): Promise<void> => {
    try {
        const { employeeCode } = req.body;

        if (!employeeCode) {
            res.status(400).json({ error: 'employeeCode is required' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { employeeCode },
        });

        if (!user) {
            res.status(404).json({ error: `Employee ${employeeCode} not found` });
            return;
        }

        const openLog = await prisma.attendanceLog.findFirst({
            where: {
                userId: user.id,
                checkOutTime: null,
            },
            orderBy: {
                checkInTime: 'desc',
            },
        });

        if (!openLog) {
            res.status(400).json({
                error: `No active check-in found for ${employeeCode} to check out from.`,
            });
            return;
        }

        const now = new Date();
        const durationMs = now.getTime() - new Date(openLog.checkInTime).getTime();
        const totalHours = Number((durationMs / (1000 * 60 * 60)).toFixed(2));

        const updatedLog = await prisma.attendanceLog.update({
            where: { id: openLog.id },
            data: {
                checkOutTime: now,
                totalHours,
            },
            include: {
                user: {
                    select: {
                        employeeCode: true,
                        fullName: true,
                    },
                },
            },
        });

        res.status(200).json({
            message: `Checked out ${employeeCode} (${totalHours} hrs)`,
            log: updatedLog,
        });
    } catch (error) {
        console.error('Error in checkOut:', error);
        res.status(500).json({ error: 'Failed to process check-out' });
    }
};