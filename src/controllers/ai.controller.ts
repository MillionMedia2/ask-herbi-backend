import { Request, Response } from "express";
import { AIService } from "../services/ai.service";

const aiService = new AIService();

export const askAI = async (req: Request, res: Response) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "Question is required and must be a string." });
    }

    const response = await aiService.getAnswer({ question });

    if (!response.success) {
      return res.status(500).json({ error: response.answer });
    }

    return res.status(200).json({ answer: response.answer });
  } catch (error: any) {
    console.error("❌ Controller Error:", error.message);
    return res
      .status(500)
      .json({ error: "Something went wrong while processing your request." });
  }
};
