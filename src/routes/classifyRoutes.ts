import express from "express";
import { getProductsByConversation } from "../controllers/classifyController";

const router = express.Router();

router.post("/classify-products", getProductsByConversation);

export default router;
