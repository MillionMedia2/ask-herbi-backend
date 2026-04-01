import { Schema, model, Document, Types } from "mongoose";

/** Snapshot from /recommend-products, stored on the assistant message that triggered it */
export interface IRecommendedProductsPayload {
  count: number;
  category?: string;
  products: Record<string, unknown>[];
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId?: string;
  content: string;
  createdAt: Date;
  recommendedProducts?: IRecommendedProductsPayload;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: false,
    },
    content: {
      type: String,
      required: true,
    },
    recommendedProducts: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const MessageModel = model<IMessage>("Message", MessageSchema);
