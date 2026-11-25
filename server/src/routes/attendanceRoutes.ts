import { Router } from "express";
import { checkIn, getAttendanceLogs } from "../controllers/attendanceController";

const router = Router();

router.post("/check-in", checkIn);
router.get("/", getAttendanceLogs);

export default router;