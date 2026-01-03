import { Router } from "express";
import { createMessage, getMessages } from "../controllers/message.controller";

const router = Router();

router.post("/messages", createMessage);
router.get("/messages/:conversationId", getMessages);

export default router;
