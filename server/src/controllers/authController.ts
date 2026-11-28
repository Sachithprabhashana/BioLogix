import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma'

export async function login(req: Request, res: Response): Promise<void> {
    try {
        const { email, employeeCode, password } = req.body as {
            email?: string
            employeeCode?: string
            password?: string
        }

        const identifier = (email || employeeCode || '').trim()
        if (!identifier || !password) {
            res.status(400).json({
                status: 'error',
                message: 'Email (or employee code) and password are required.',
            })
            return
        }

        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: identifier.toLowerCase() },
                    { employeeCode: identifier.toUpperCase() },
                ],
            },
        })

        if (!user || !user.passwordHash) {
            res.status(401).json({
                status: 'error',
                message: 'Invalid credentials.',
            })
            return
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash)
        if (!isMatch) {
            res.status(401).json({
                status: 'error',
                message: 'Invalid credentials.',
            })
            return
        }

        const secret = process.env.JWT_SECRET
        if (!secret) {
            res.status(500).json({
                status: 'error',
                message: 'JWT_SECRET is not configured.',
            })
            return
        }

        const token = jwt.sign(
            {
                userId: user.id,
                employeeCode: user.employeeCode,
                role: user.role,
            },
            secret,
            { expiresIn: '7d' }
        )

        res.json({
            status: 'success',
            token,
            user: {
                id: user.id,
                employeeCode: user.employeeCode,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                biometricHash: user.biometricHash,
            },
        })
    } catch (err) {
        console.error('Login error:', err)
        res.status(500).json({
            status: 'error',
            message: 'Failed to log in.',
        })
    }
}