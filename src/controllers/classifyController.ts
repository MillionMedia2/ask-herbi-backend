import { Request, Response } from "express";
import { classifyConversation } from "../services/classifyService";
import { wooApi } from "../services/wooClient";

export const getProductsByConversation = async (
  req: Request,
  res: Response
) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Classify and get matched products
    const result = await classifyConversation(message);

    res.json(result);
  } catch (error: any) {
    console.error("Error in classification:", error);
    res.status(500).json({ error: "Failed to classify and fetch products" });
  }
};
