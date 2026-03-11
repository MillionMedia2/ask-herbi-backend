// import { Request, Response } from "express";
// import { AIService } from "../services/ai.service";

// const aiService = new AIService();

// export const askAI = async (req: Request, res: Response) => {
//   try {
//     const { question } = req.body;

//     if (!question || typeof question !== "string") {
//       return res
//         .status(400)
//         .json({ error: "Question is required and must be a string." });
//     }

//     const response = await aiService.getAnswer({ question });

//     if (!response.success) {
//       return res.status(500).json({ error: response.answer });
//     }

//     return res.status(200).json({ answer: response.answer });
//   } catch (error: any) {
//     console.error("Controller Error:", error.message);
//     return res
//       .status(500)
//       .json({ error: "Something went wrong while processing your request." });
//   }
// };

// /**
//  * Streaming endpoint (Server-Sent Events)
//  */
// export const askAIStream = async (req: Request, res: Response) => {
//   try {
//     const { question } = req.body;
//     console.log("📩 Received streaming question:", question);

//     if (!question || typeof question !== "string") {
//       return res
//         .status(400)
//         .json({ error: "Question is required and must be a string." });
//     }

//     // Set headers for SSE
//     res.setHeader("Content-Type", "text/event-stream");
//     res.setHeader("Cache-Control", "no-cache");
//     res.setHeader("Connection", "keep-alive");
//     res.setHeader("X-Accel-Buffering", "no"); // Disable buffering in nginx

//     // Get the stream
//     const stream = await aiService.getAnswerStreamTransformed({ question });
//     const reader = stream.getReader();

//     // Stream the response
//     try {
//       while (true) {
//         const { done, value } = await reader.read();

//         if (done) {
//           res.write("data: [DONE]\n\n");
//           res.end();
//           break;
//         }

//         // Send each chunk as SSE
//         res.write(`data: ${JSON.stringify({ content: value })}\n\n`);
//       }
//     } catch (streamError: any) {
//       console.error("Streaming Error:", streamError.message);
//       res.write(
//         `data: ${JSON.stringify({ error: "Streaming error occurred" })}\n\n`
//       );
//       res.end();
//     }
//   } catch (error: any) {
//     console.error("Controller Error:", error.message);

//     if (!res.headersSent) {
//       return res
//         .status(500)
//         .json({ error: "Something went wrong while processing your request." });
//     } else {
//       res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
//       res.end();
//     }
//   }
// };

import { Request, Response } from "express";
import { AIService } from "../services/ai.service";

const aiService = new AIService();

/**
 * Non-streaming endpoint
 */
export const askAI = async (req: Request, res: Response) => {
  try {
    const { question, conversationId } = req.body;

    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "Question is required and must be a string." });
    }

    const response = await aiService.getAnswer({
      question,
      conversationId, // Pass conversationId to maintain context
    });

    if (!response.success) {
      return res.status(500).json({ error: response.answer });
    }

    return res.status(200).json({
      answer: response.answer,
      conversationId: response.conversationId, // Return conversationId for next request
    });
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
    const { question, conversationId } = req.body;
    console.log("📩 Received streaming question:", question);
    console.log("💬 Conversation ID:", conversationId);

    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "Question is required and must be a string." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stream = await aiService.getAnswerStreamTransformed({
      question,
      conversationId, // Pass conversationId to maintain context
    });
    const reader = stream.getReader();

    let currentConversationId = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          res.write(
            `data: ${JSON.stringify({
              type: "done",
              conversationId: currentConversationId,
            })}\n\n`
          );
          res.end();
          break;
        }

        if (value.startsWith("__CONVERSATION_ID__:")) {
          currentConversationId = value
            .replace("__CONVERSATION_ID__:", "")
            .trim();
          console.log(`✅ Conversation ID: ${currentConversationId}`);

          res.write(
            `data: ${JSON.stringify({
              type: "conversationId",
              conversationId: currentConversationId,
            })}\n\n`
          );
          continue;
        }

        res.write(
          `data: ${JSON.stringify({
            type: "content",
            content: value,
          })}\n\n`
        );
      }
    } catch (streamError: any) {
      console.error("Streaming Error:", streamError.message);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: "Streaming error occurred",
        })}\n\n`
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
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: error.message,
        })}\n\n`
      );
      res.end();
    }
  }
};

/**
 * Clear conversation history endpoint
 */
export const clearConversation = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId || typeof conversationId !== "string") {
      return res
        .status(400)
        .json({ error: "conversationId is required and must be a string." });
    }

    aiService.clearConversation(conversationId);

    return res.status(200).json({
      success: true,
      message: "Conversation cleared successfully.",
    });
  } catch (error: any) {
    console.error("Controller Error:", error.message);
    return res
      .status(500)
      .json({ error: "Something went wrong while clearing conversation." });
  }
};
