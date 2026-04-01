import { Types } from "mongoose";
import { MessageModel } from "../models/Message.model";
import { ConversationModel } from "../models/Conversation.model";

export const createMessage = async (data: {
  conversationId: string;
  senderId?: string;
  content: string;
}) => {
  // If user is not logged in (no senderId), don't save the message
  if (!data.senderId) {
    return null;
  }

  const conversationObjectId = new Types.ObjectId(data.conversationId);

  const message = await MessageModel.create({
    conversationId: conversationObjectId,
    senderId: data.senderId,
    content: data.content,
  });

  await ConversationModel.findByIdAndUpdate(
    conversationObjectId,
    {
      lastMessage: data.content,
    },
    { new: true }
  );

  return message;
};

export const getMessagesByConversation = async (conversationId: string) => {
  return MessageModel.find({
    conversationId: new Types.ObjectId(conversationId),
  }).sort({ createdAt: 1 });
};

export const attachRecommendedProducts = async (
  messageId: string,
  payload: { count: number; category?: string; products: unknown[] }
) => {
  if (!Types.ObjectId.isValid(messageId)) {
    throw new Error("Invalid message id");
  }
  if (!Array.isArray(payload.products)) {
    throw new Error("products must be an array");
  }
  const updated = await MessageModel.findByIdAndUpdate(
    messageId,
    {
      $set: {
        recommendedProducts: {
          count: payload.count,
          ...(payload.category !== undefined && payload.category !== ""
            ? { category: payload.category }
            : {}),
          products: payload.products,
        },
      },
    },
    { new: true }
  );
  if (!updated) {
    throw new Error("Message not found");
  }
  return updated;
};
