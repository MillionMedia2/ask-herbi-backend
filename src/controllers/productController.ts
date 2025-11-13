import { Request, Response } from "express";
import { wooApi } from "../services/wooClient";

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { data } = await wooApi.get("products", {
      per_page: 20,
      page: 1,
    });

    const cleanedProducts = data.map((product: any) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      permalink: product.permalink,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      stock_quantity: product.stock_quantity,
      stock_status: product.stock_status,
      on_sale: product.on_sale,
      category:
        product.categories && product.categories.length > 0
          ? product.categories[0].name
          : null,
      brand:
        product.brands && product.brands.length > 0
          ? product.brands[0].name
          : null,
      images: product.images.map((img: any) => ({
        id: img.id,
        src: img.src,
      })),
    }));

    res.json(cleanedProducts);
  } catch (error: any) {
    console.error(
      "WooCommerce API Error:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch products" });
  }
};
