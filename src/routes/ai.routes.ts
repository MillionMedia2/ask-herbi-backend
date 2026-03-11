import { Router } from "express";
import { askAI, askAIStream } from "../controllers/ai.controller";

const router = Router();

router.post("/ask", askAI);
router.post("/ask/stream", askAIStream);

export default router;
