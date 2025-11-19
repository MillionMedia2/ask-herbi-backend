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
    console.error("Controller Error:", error.message);
    return res
      .status(500)
      .json({ error: "Something went wrong while processing your request." });
  }
};

/**
 * Streaming endpoint (Server-Sent Events)
 */
export const askAIStream = async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    console.log("📩 Received streaming question:", question);

    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "Question is required and must be a string." });
    }

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable buffering in nginx

    // Get the stream
    const stream = await aiService.getAnswerStreamTransformed({ question });
    const reader = stream.getReader();

    // Stream the response
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          res.write("data: [DONE]\n\n");
          res.end();
          break;
        }

        // Send each chunk as SSE
        res.write(`data: ${JSON.stringify({ content: value })}\n\n`);
      }
    } catch (streamError: any) {
      console.error("Streaming Error:", streamError.message);
      res.write(
        `data: ${JSON.stringify({ error: "Streaming error occurred" })}\n\n`
      );
      res.end();
    }
  } catch (error: any) {
    console.error("Controller Error:", error.message);

    if (!res.headersSent) {
      return res
        .status(500)
        .json({ error: "Something went wrong while processing your request." });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};
