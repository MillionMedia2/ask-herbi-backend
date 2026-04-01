import type { IProduct } from "../models/Product";

/**
 * Creates a simple, readable text string for AI embeddings.
 */
export function buildEmbeddingText(
  product: Pick<IProduct, "name" | "category" | "brand">,
): string {
  const name = product.name?.trim() ?? "";
  const category = product.category?.trim() ?? "";
  const brand = product.brand?.trim() ?? "";

  // Example: "<name> <brand> <category> category"
  const parts: string[] = [];
  if (name) parts.push(name);
  if (brand) parts.push(brand);
  if (category) parts.push(`${category} category`);

  return parts.join(" ").trim();
}

