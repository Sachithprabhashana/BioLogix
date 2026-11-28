import { Router } from "express";
import multer from "multer";
import {
    checkIn,
    getAttendanceLogs,
    verifyCheckIn,
    checkOut,
} from "../controllers/attendanceController.js";
import { authenticateToken } from '../middleware/authMiddleware'

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/', authenticateToken, getAttendanceLogs)
router.post('/check-in', authenticateToken, checkIn)
router.post("/verify-check-in", upload.single("image"), verifyCheckIn, authenticateToken);
router.post('/check-out', authenticateToken, checkOut)

export default router;