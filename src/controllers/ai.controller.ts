import { Request, Response } from "express";
import { AIService } from "../services/ai.service";

const aiService = new AIService();

export const askAI = async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const response = await aiService.getAnswer({ question });
    res.status(200).json(response);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
