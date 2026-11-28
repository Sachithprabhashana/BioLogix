import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
    userId: string
    employeeCode: string
    role: 'ADMIN' | 'EMPLOYEE'
}

export interface AuthenticatedRequest extends Request {
    auth?: AuthPayload
}

export function authenticateToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null

    if (!token) {
        res.status(401).json({ status: 'error', message: 'Authentication token required.' })
        return
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
        res.status(500).json({ status: 'error', message: 'JWT_SECRET is not configured.' })
        return
    }

    try {
        const decoded = jwt.verify(token, secret) as AuthPayload
        req.auth = decoded
        next()
    } catch {
        res.status(401).json({ status: 'error', message: 'Invalid or expired token.' })
    }
}

export function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    if (!req.auth) {
        res.status(401).json({ status: 'error', message: 'Unauthorized.' })
        return
    }

    if (req.auth.role !== 'ADMIN') {
        res.status(403).json({ status: 'error', message: 'Admin access required.' })
        return
    }

    next()
}