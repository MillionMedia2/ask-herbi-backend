import { Request, Response } from "express";
import * as MessageService from "../services/message.service";
import { AIService } from "../services/ai.service";

const aiService = new AIService();

export const createMessage = async (req: Request, res: Response) => {
  try {
    const { conversationId, senderId, content } = req.body;

    // If user is not logged in (no senderId), stream AI response without saving
    if (!senderId) {
      if (!content || typeof content !== "string") {
        return res.status(400).json({
          success: false,
          message: "Content is required and must be a string",
        });
      }

      // Set headers for SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const stream = await aiService.getAnswerStreamTransformed({
        question: content,
        conversationId, // Pass conversationId to maintain context (but won't save to DB)
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
      return;
    }

    // If senderId exists, save message to DB
    const message = await MessageService.createMessage({
      conversationId,
      senderId,
      content,
    });

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
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

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const conversationIdStr = Array.isArray(conversationId) 
      ? conversationId[0] 
      : conversationId;

    if (!conversationIdStr) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    const messages = await MessageService.getMessagesByConversation(
      conversationIdStr
    );

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
