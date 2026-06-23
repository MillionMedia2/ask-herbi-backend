import { Request, Response } from "express";
import Product from "../models/Product";

const sendSuccess = (res: Response, data: unknown, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

const sendError = (res: Response, message: string, statusCode = 500) => {
  return res.status(statusCode).json({ success: false, message });
};

export const getAdminProducts = async (_req: Request, res: Response) => {
  try {
    const products = await Product.find({}).sort({ name: 1 }).lean();
    return sendSuccess(res, products);
  } catch (error: any) {
    console.error("Admin getAdminProducts error:", error.message);
    return sendError(res, "Failed to fetch products");
  }
};

export const getAdminProductById = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return sendError(res, "Invalid product id", 400);
    }

    const product = await Product.findOne({ id: productId }).lean();
    if (!product) {
      return sendError(res, "Product not found", 404);
    }

    return sendSuccess(res, product);
  } catch (error: any) {
    console.error("Admin getAdminProductById error:", error.message);
    return sendError(res, "Failed to fetch product");
  }
};

export const updateAdminProduct = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);

    if (!Number.isFinite(productId)) {
      return sendError(res, "Invalid product id", 400);
    }

    const { price, stock_status, stock_quantity, image_src, images } =
      req.body ?? {};

    const update: Record<string, unknown> = {};

    if (typeof price === "string") {
      update.price = price;
      update.regular_price = price;
    }

    if (typeof stock_status === "string") {
      const normalized = stock_status.toLowerCase();
      if (!["instock", "outofstock", "onbackorder"].includes(normalized)) {
        return sendError(res, "Invalid stock_status", 400);
      }
      update.stock_status = normalized;
    }

    if (stock_quantity === null || typeof stock_quantity === "number") {
      update.stock_quantity = stock_quantity;
    }

    if (Array.isArray(images) && images.length > 0) {
      update.images = images
        .filter(
          (img: { src?: string }) =>
            typeof img?.src === "string" && img.src.trim().length > 0,
        )
        .map((img: { id?: number; src?: string }, index: number) => ({
          id: Number(img?.id ?? 0) || index + 1,
          src: String(img?.src ?? "").trim(),
        }));
    } else if (typeof image_src === "string" && image_src.trim().length > 0) {
      const existing = await Product.findOne({ id: productId }).lean();
      if (!existing) {
        return sendError(res, "Product not found", 404);
      }

      const currentImages = Array.isArray(existing.images)
        ? existing.images
        : [];
      const firstImageId = currentImages[0]?.id ?? 1;
      const restImages = currentImages.slice(1);

      update.images = [
        { id: firstImageId, src: image_src.trim() },
        ...restImages,
      ];
    }

    if (Object.keys(update).length === 0) {
      return sendError(res, "No valid fields to update", 400);
    }

    const updated = await Product.findOneAndUpdate(
      { id: productId },
      { $set: update },
      { new: true },
    ).lean();

    if (!updated) {
      return sendError(res, "Product not found", 404);
    }

    return sendSuccess(res, updated);
  } catch (error: any) {
    console.error("Admin updateAdminProduct error:", error.message);
    return sendError(res, "Failed to update product");
  }
};
