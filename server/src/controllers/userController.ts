import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";

// POST /api/users - Register a new user/employee
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { employeeCode, fullName, email, password, role } = req.body;

        if (!employeeCode || !fullName || !email || !password) {
            res.status(400).json({
                status: "error",
                message: "employeeCode, fullName, email, and password are required.",
            });
            return;
        }

        // Check if employeeCode or email already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email }, { employeeCode }],
            },
        });

        if (existingUser) {
            res.status(409).json({
                status: "error",
                message: "A user with this email or employeeCode already exists.",
            });
            return;
        }

        // Simple SHA-256 hash for initial setup (can upgrade to bcrypt later)
        const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

        const newUser = await prisma.user.create({
            data: {
                employeeCode,
                fullName,
                email,
                passwordHash,
                role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
            },
            select: {
                id: true,
                employeeCode: true,
                fullName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.status(201).json({
            status: "ok",
            data: newUser,
        });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to create user.",
        });
    }
};

// GET /api/users - Fetch all registered users
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                employeeCode: true,
                fullName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.json({
            status: "ok",
            count: users.length,
            data: users,
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            status: "error",
            message: "Failed to fetch users.",
        });
    }
};