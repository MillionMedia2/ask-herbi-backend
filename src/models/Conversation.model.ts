import { Schema, model, Document } from "mongoose";

export interface IConversation extends Document {
  title: string;
  participants: string[];
  lastMessage?: string;
  isPinned?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    participants: {
      type: [String],
      required: true,
      index: true,
    },
    lastMessage: {
      type: String,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  }
);

export const ConversationModel = model<IConversation>(
  "Conversation",
  ConversationSchema
);
