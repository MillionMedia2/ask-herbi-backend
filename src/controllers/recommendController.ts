import { Request, Response } from "express";
import type { IMessage } from "../models/Message.model";
import { recommendProducts, searchProducts } from "../services/productSearch";

export const getRecommendedProducts = async (req: Request, res: Response) => {
  try {
    const { messages } = req.body as { messages?: IMessage[] };

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "`messages` must be an array." });
    }

    const safeMessages = messages
      .filter((m) => m && typeof m.content === "string")
      .map((m) => ({
        content: m.content,
        senderId: m.senderId,
      }));

    const products = await recommendProducts(safeMessages);

    return res.json({
      count: products.length,
      products,
    });
  } catch (error: any) {
    console.error("Error in getRecommendedProducts:", error);
    return res
      .status(500)
      .json({ error: "Failed to recommend products." });
  }
};

export const getSearchedProducts = async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "`query` must be a string." });
    }

    const products = await searchProducts(query);

    return res.json({
      count: products.length,
      products,
    });
  } catch (error: any) {
    console.error("Error in getSearchedProducts:", error);
    return res.status(500).json({ error: "Failed to search products." });
  }
};

