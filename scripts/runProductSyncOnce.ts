import dotenv from "dotenv";

import connectDB from "../src/config/db";
import { wooApi } from "../src/services/wooClient";
import Product from "../src/models/Product";
import { enrichProduct } from "../src/services/productEnrichment";
import { upsertToPinecone } from "../src/services/productSearch";

dotenv.config();

type WooBrand = { id?: number; name?: string };
type WooCategory = { id?: number; name?: string };
type WooImage = { id?: number; src?: string };

type WooProduct = {
  id: number;
  name?: string;
  slug?: string;
  permalink?: string;
  price?: string | number | null;
  regular_price?: string | number | null;
  sale_price?: string | number | null;
  short_description?: string;
  stock_quantity?: number | null;
  stock_status?: string;
  on_sale?: boolean;
  type?: string;
  categories?: WooCategory[];
  brands?: WooBrand[];
  images?: WooImage[];
};

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function getCategoryName(product: WooProduct): string {
  const categories = product.categories ?? [];
  return categories.length > 0 ? toStringValue(categories[0]?.name) : "";
}

function getBrandName(product: WooProduct): string {
  const brands = product.brands ?? [];
  return brands.length > 0 ? toStringValue(brands[0]?.name) : "";
}

function mapWooImages(product: WooProduct): Array<{ id: number; src: string }> {
  const images = product.images ?? [];
  return images
    .map((img) => ({
      id: Number(img.id ?? 0),
      src: toStringValue(img.src),
    }))
    .filter((img) => img.id !== 0 && img.src);
}

async function fetchAllWooProducts(): Promise<WooProduct[]> {
  const perPage = 100;
  let page = 1;
  let all: WooProduct[] = [];

  while (true) {
    const { data } = await wooApi.get("products", {
      per_page: perPage,
      page,
      status: "publish",
      catalog_visibility: "visible",
    });

    const batch = (data ?? []) as WooProduct[];
    if (!batch.length) break;
    all = [...all, ...batch];
    page += 1;
  }

  return all;
}

async function main() {
  await connectDB();

  const namespace =
    (process.env.PINECONE_PRODUCTS_NAMESPACE || "woocommerce Products").trim();
  console.log(`Syncing Woo products -> Mongo + Pinecone namespace="${namespace}"`);

  const wooProducts = await fetchAllWooProducts();
  console.log(`Fetched ${wooProducts.length} Woo products`);

  let upserts = 0;
  let skipped = 0;

  for (const woo of wooProducts) {
    const category = getCategoryName(woo);
    const brand = getBrandName(woo);
    const images = mapWooImages(woo);
    const productType = toStringValue(woo.type);

    const enriched = enrichProduct({
      name: woo.name ?? "",
      short_description: woo.short_description ?? "",
      categories: woo.categories ?? [],
    });

    if (!enriched.embedding_text?.trim()) {
      skipped += 1;
      continue;
    }

    await Product.findOneAndUpdate(
      { id: woo.id },
      {
        $set: {
          id: woo.id,
          name: woo.name ?? "",
          slug: woo.slug ?? "",
          permalink: woo.permalink ?? "",
          price: toStringValue(woo.price),
          regular_price: toStringValue(woo.regular_price),
          sale_price: toStringValue(woo.sale_price),
          stock_quantity:
            typeof woo.stock_quantity === "number" ? woo.stock_quantity : null,
          stock_status: woo.stock_status ?? "",
          on_sale: Boolean(woo.on_sale),
          category,
          brand,
          images,
          embedding_text: enriched.embedding_text,
        },
      },
      { upsert: true, new: true },
    );

    await upsertToPinecone({
      id: woo.id,
      name: woo.name ?? "",
      price: toStringValue(woo.price),
      stock_status: woo.stock_status,
      stock_quantity:
        typeof woo.stock_quantity === "number" ? woo.stock_quantity : null,
      images: images.map((img) => ({ src: img.src })),
      permalink: woo.permalink,
      product_type: productType,
      embedding_text: enriched.embedding_text,
    });

    upserts += 1;
    if (upserts % 50 === 0) console.log(`Upserted ${upserts}/${wooProducts.length}`);
  }

  console.log(`✅ Done. upserts=${upserts} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ runProductSyncOnce failed:", err);
  process.exit(1);
});

