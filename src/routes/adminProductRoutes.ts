import express from "express";
import {
  getAdminProductById,
  getAdminProducts,
  updateAdminProduct,
} from "../controllers/adminProductController";
import { requireAdminAuth } from "../middleware/adminAuth";

const router = express.Router();

router.get("/admin/products", requireAdminAuth, getAdminProducts);
router.get("/admin/products/:id", requireAdminAuth, getAdminProductById);
router.patch("/admin/products/:id", requireAdminAuth, updateAdminProduct);

export default router;
