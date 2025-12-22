import { Types } from "mongoose";
import { ConversationModel, IConversation } from "../models/Conversation.model";

export const createConversation = async (data: {
  title: string;
  participants?: string[];
}) => {
  const conversation = await ConversationModel.create({
    title: data.title,
    participants: data.participants || ["user", "assistant"],
    isPinned: false,
  });

  return conversation;
};

export const getAllConversations = async () => {
  return ConversationModel.find().sort({ isPinned: -1, updatedAt: -1 });
};

export const updateConversation = async (
  conversationId: string,
  updateData: Partial<IConversation>
) => {
  const conversationObjectId = new Types.ObjectId(conversationId);
  
  const updatedConversation = await ConversationModel.findByIdAndUpdate(
    conversationObjectId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedConversation) {
    throw new Error("Conversation not found");
  }

  return updatedConversation;
};

export const deleteConversation = async (conversationId: string) => {
  const conversationObjectId = new Types.ObjectId(conversationId);
  
  const deletedConversation = await ConversationModel.findByIdAndDelete(
    conversationObjectId
  );

  if (!deletedConversation) {
    throw new Error("Conversation not found");
  }

  return deletedConversation;
};

export const pinConversation = async (
  conversationId: string,
  isPinned: boolean
) => {
  const conversationObjectId = new Types.ObjectId(conversationId);
  
  const updatedConversation = await ConversationModel.findByIdAndUpdate(
    conversationObjectId,
    { isPinned },
    { new: true }
  );

  if (!updatedConversation) {
    throw new Error("Conversation not found");
  }

  return updatedConversation;
};

