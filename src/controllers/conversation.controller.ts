import { Request, Response } from "express";
import * as ConversationService from "../services/conversation.service";

export const createConversation = async (req: Request, res: Response) => {
  try {
    const { title, participants } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({
        success: false,
        message: "Title is required and must be a string",
      });
    }

    const conversation = await ConversationService.createConversation({
      title,
      participants,
    });

    res.status(201).json({
      success: true,
      data: conversation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllConversations = async (req: Request, res: Response) => {
  try {
    const conversations = await ConversationService.getAllConversations();

    res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    
    if (!idStr) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const updateData = req.body; // Generic update, currently only title but extensible

    const updatedConversation = await ConversationService.updateConversation(
      idStr,
      updateData
    );

    res.status(200).json({
      success: true,
      data: updatedConversation,
    });
  } catch (error: any) {
    const statusCode = error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    
    if (!idStr) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const deletedConversation = await ConversationService.deleteConversation(idStr);

    res.status(200).json({
      success: true,
      data: deletedConversation,
      message: "Conversation deleted successfully",
    });
  } catch (error: any) {
    const statusCode = error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

export const pinConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    
    if (!idStr) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const { isPinned } = req.body;

    if (typeof isPinned !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isPinned must be a boolean value",
      });
    }

    const updatedConversation = await ConversationService.pinConversation(
      idStr,
      isPinned
    );

    res.status(200).json({
      success: true,
      data: updatedConversation,
    });
  } catch (error: any) {
    const statusCode = error.message === "Conversation not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

