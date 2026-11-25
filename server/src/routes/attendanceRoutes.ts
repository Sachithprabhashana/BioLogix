import { Router } from "express";
import multer from "multer";
import {
    checkIn,
    getAttendanceLogs,
    verifyCheckIn,
    checkOut,
} from "../controllers/attendanceController.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/check-in", checkIn);
router.get("/", getAttendanceLogs);
router.post("/verify-check-in", upload.single("image"), verifyCheckIn);
router.post("/check-out", checkOut);

export default router;