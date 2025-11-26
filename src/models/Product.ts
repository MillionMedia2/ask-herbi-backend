import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price?: string;
  stock_quantity?: number | null;
  stock_status: string;
  on_sale: boolean;
  category: string;
  brand: string;
  images: {
    id: number;
    src: string;
  }[];
}

const imageSchema = new Schema(
  {
    id: { type: Number, required: true },
    src: { type: String, required: true },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    permalink: { type: String, required: true },

    price: { type: String, required: true },
    regular_price: { type: String, required: true },
    sale_price: { type: String, default: "" },

    stock_quantity: { type: Number, default: null },
    stock_status: { type: String, required: true },
    on_sale: { type: Boolean, default: false },

    category: { type: String, required: true },
    brand: { type: String, required: true },

    images: { type: [imageSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>("Product", productSchema);
