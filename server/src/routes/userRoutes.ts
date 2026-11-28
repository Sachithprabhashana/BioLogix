import { Router } from "express";
import multer from "multer";
import { createUser, getAllUsers, enrollFace } from "../controllers/userController";
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware'

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticateToken, requireAdmin, getAllUsers)
router.post('/', authenticateToken, requireAdmin, createUser)
router.post("/:employeeCode/enroll-face", upload.single("image"), authenticateToken, requireAdmin, enrollFace);

export default router;

