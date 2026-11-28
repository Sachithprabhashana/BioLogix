import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";

interface ExtractEmbeddingResponse {
    status?: string;
    embedding?: number[];
    detectionConfidence?: number;
    message?: string;
}

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

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCode = String(employeeCode).trim().toUpperCase();

        // Check if employeeCode or email already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email: normalizedEmail }, { employeeCode: normalizedCode }],
            },
        });

        if (existingUser) {
            res.status(409).json({
                status: "error",
                message: "A user with this email or employeeCode already exists.",
            });
            return;
        }

        const passwordHash = await bcrypt.hash(String(password), 12);

        const newUser = await prisma.user.create({
            data: {
                employeeCode: normalizedCode,
                fullName: String(fullName).trim(),
                email: normalizedEmail,
                passwordHash,
                role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
            },
            select: {
                id: true,
                employeeCode: true,
                fullName: true,
                email: true,
                role: true,
                biometricHash: true,
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
                biometricHash: true,
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

export const enrollFace = async (req: Request, res: Response): Promise<void> => {
    try {
        const employeeCode = String(req.params.employeeCode || "").trim();
        const file = req.file;

        if (!employeeCode) {
            res.status(400).json({ status: "error", message: "employeeCode is required" });
            return;
        }

        if (!file) {
            res.status(400).json({ status: "error", message: "Face image file is required" });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { employeeCode },
        });

        if (!user) {
            res.status(404).json({ status: "error", message: `Employee ${employeeCode} not found` });
            return;
        }

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(file.buffer)], {
            type: file.mimetype || "image/jpeg",
        });
        formData.append("image", blob, file.originalname || "enroll.jpg");

        const aiRes = await fetch("http://127.0.0.1:5001/extract-embedding", {
            method: "POST",
            body: formData,
        });

        const aiData = (await aiRes.json()) as ExtractEmbeddingResponse;

        if (!aiRes.ok || aiData.status !== "ok" || !aiData.embedding) {
            res.status(422).json({
                status: "error",
                message: aiData.message || "Could not extract face embedding from image",
            });
            return;
        }

        const serializedEmbedding = JSON.stringify(aiData.embedding);
        const biometricHash = crypto
            .createHash("sha256")
            .update(serializedEmbedding)
            .digest("hex");

        const updatedUser = await prisma.user.update({
            where: { employeeCode },
            data: {
                encryptedBiometric: serializedEmbedding,
                biometricHash,
            },
            select: {
                id: true,
                employeeCode: true,
                fullName: true,
                email: true,
                role: true,
                biometricHash: true,
            },
        });

        res.json({
            status: "ok",
            message: `Face enrolled for ${employeeCode}`,
            detectionConfidence: aiData.detectionConfidence,
            user: updatedUser,
        });
    } catch (error) {
        console.error("Error in enrollFace:", error);
        res.status(500).json({ status: "error", message: "Failed to enroll reference face" });
    }
};