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
