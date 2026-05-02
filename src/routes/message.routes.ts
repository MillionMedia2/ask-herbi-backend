import { Router } from "express";
import {
  createMessage,
  getMessages,
  patchMessageRecommendedProducts,
} from "../controllers/message.controller";

const router = Router();

router.post("/messages", createMessage);
router.patch(
  "/messages/:messageId/recommended-products",
  patchMessageRecommendedProducts
);
router.get("/messages/:conversationId", getMessages);

export default router;
