import { Router } from "express";
import {
  createConversation,
  getAllConversations,
  updateConversation,
  deleteConversation,
  pinConversation,
} from "../controllers/conversation.controller";

const router = Router();

router.post("/conversations", createConversation);
router.get("/conversations", getAllConversations);
router.put("/conversations/:id", updateConversation);
router.delete("/conversations/:id", deleteConversation);
router.patch("/conversations/:id/pin", pinConversation);

export default router;

