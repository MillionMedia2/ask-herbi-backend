import express from "express";
import {
  adminLogin,
  adminMe,
  adminSignup,
  updateAdminProfile,
} from "../controllers/adminAuthController";
import { requireAdminAuth } from "../middleware/adminAuth";

const router = express.Router();

router.post("/admin/auth/signup", adminSignup);
router.post("/admin/auth/login", adminLogin);
router.get("/admin/auth/me", requireAdminAuth, adminMe);
router.patch("/admin/auth/me", requireAdminAuth, updateAdminProfile);

export default router;
