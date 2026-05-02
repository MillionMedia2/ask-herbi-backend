import cron from "node-cron";
import Product from "../models/Product";
import { wooApi } from "../services/wooClient";
import { enrichProduct } from "../services/productEnrichment";
import {
  deleteProductFromPinecone,
  upsertToPinecone,
} from "../services/productSearch";
import { getPlantz1Namespace } from "../utils/pineconeClient";

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

const PRODUCTS_NAMESPACE =
  process.env.PINECONE_PRODUCTS_NAMESPACE || "woocommerce Products";

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeImages(
  images: Array<{ id: number; src: string }> | undefined,
): Array<{ id: number; src: string }> {
  if (!images || images.length === 0) return [];
  return [...images].sort((a, b) => a.id - b.id);
}

function imagesEqual(
  a: Array<{ id: number; src: string }> | undefined,
  b: Array<{ id: number; src: string }> | undefined,
): boolean {
  const aNorm = normalizeImages(a);
  const bNorm = normalizeImages(b);
  if (aNorm.length !== bNorm.length) return false;
  return aNorm.every(
    (img, idx) => img.id === bNorm[idx].id && img.src === bNorm[idx].src,
  );
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

function isInStock(product: WooProduct): boolean {
  const stockStatus = product.stock_status?.toLowerCase();
  if (stockStatus === "instock") return true;
  if (typeof product.stock_quantity === "number") {
    return product.stock_quantity > 0;
  }
  return false;
}

function mapConditionsFromCategory(category: string): string[] {
  const c = (category ?? "").toLowerCase();
  const conditions: string[] = [];

  if (!c) return [];

  if (c.includes("sleep") || c.includes("insomnia") || c.includes("rest")) {
    conditions.push("insomnia", "sleep");
  }

  if (c.includes("stress") || c.includes("anxiety") || c.includes("calm")) {
    conditions.push("stress", "anxiety");
  }

  if (c.includes("digestion") || c.includes("gut") || c.includes("stomach")) {
    conditions.push("indigestion");
  }

  if (c.includes("immune")) {
    conditions.push("immune support");
  }

  if (c.includes("cold") || c.includes("flu") || c.includes("cough")) {
    conditions.push("common cold", "cough", "flu");
  }

  if (c.includes("pain") || c.includes("muscle") || c.includes("joint")) {
    conditions.push("pain");
  }

  if (conditions.length === 0 && category) conditions.push(category.trim());

  return Array.from(new Set(conditions));
}

function mapBodySystemsFromCategory(category: string): string[] {
  const c = (category ?? "").toLowerCase();
  const bodySystems: string[] = [];

  if (!c) return [];

  if (c.includes("sleep") || c.includes("stress") || c.includes("anxiety") || c.includes("calm")) {
    bodySystems.push("nervous system");
  }

  if (c.includes("digestion") || c.includes("gut") || c.includes("stomach")) {
    bodySystems.push("digestive system");
  }

  if (c.includes("immune")) {
    bodySystems.push("immune system");
  }

  if (c.includes("cold") || c.includes("flu") || c.includes("cough")) {
    bodySystems.push("respiratory system", "immune system");
  }

  if (c.includes("pain") || c.includes("muscle") || c.includes("joint")) {
    bodySystems.push("musculoskeletal system");
  }

  return Array.from(new Set(bodySystems));
}

const fetchWooProducts = async () => {
  try {
    const perPage = 100;
    let page = 1;
    let allProducts: WooProduct[] = [];

    while (true) {
      const { data } = await wooApi.get("products", {
        per_page: perPage,
        page,
        status: "publish",
        catalog_visibility: "visible",
      });

      const batch = (data ?? []) as WooProduct[];
      if (!batch.length) break;

      allProducts = [...allProducts, ...batch];
      page++;
    }

    return allProducts;
  } catch (err: any) {
    console.error("Failed to fetch WooCommerce products:", err.message);
    return [];
  }
};

const startProductCron = () => {
  // Runs once every 24 hours (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Cron Job Started: Fetching WooCommerce Products...");

    const wooProducts = (await fetchWooProducts()) as WooProduct[];

    if (!wooProducts.length) {
      console.log("⚠ No products found!");
      return;
    }

    const wooIds = wooProducts.map((p) => p.id).filter((id) => Number.isFinite(id));
    const wooIdSet = new Set(wooIds);

    // Load existing products once for faster lookups
    const existingProducts = await Product.find({ id: { $in: wooIds } });
    const existingById = new Map(existingProducts.map((p) => [p.id, p]));

    // Delete Pinecone records for products no longer present in Woo
    const existingAll = await Product.find({}, { id: 1, _id: 0 }).lean();
    const removedIds = existingAll
      .map((p: any) => p.id)
      .filter((id: number) => !wooIdSet.has(id));

    const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);

    for (const removedId of removedIds) {
      await deleteProductFromPinecone(removedId);
    }

    let fullUpserts = 0;
    let metadataOnlyUpdates = 0;

    for (const woo of wooProducts) {
      const existing = existingById.get(woo.id);

      const category = getCategoryName(woo);
      const brand = getBrandName(woo);
      const images = mapWooImages(woo);
      const productType = toStringValue(woo.type);

      const enriched = enrichProduct({
        name: woo.name ?? "",
        short_description: woo.short_description ?? "",
        categories: woo.categories ?? [],
      });

      const embeddingTextChanged =
        !existing || (existing.embedding_text ?? "") !== enriched.embedding_text;

      // Prepare the new mongo fields (including the vector embedding inputs)
      const nextMongoFields = {
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
      };

      if (embeddingTextChanged) {
        const conditions = mapConditionsFromCategory(category);
        const body_systems = mapBodySystemsFromCategory(category);

        await Product.findOneAndUpdate(
          { id: woo.id },
          {
            $set: {
              ...nextMongoFields,
              embedding_text: enriched.embedding_text,
              conditions,
              body_systems,
            },
          },
          { upsert: true, new: true },
        );

        await upsertToPinecone({
          id: woo.id,
          name: nextMongoFields.name,
          price: nextMongoFields.price,
          stock_status: nextMongoFields.stock_status,
          stock_quantity: nextMongoFields.stock_quantity,
          images: images.map((img) => ({ src: img.src })),
          permalink: nextMongoFields.permalink,
          product_type: productType,
          embedding_text: enriched.embedding_text,
        });

        fullUpserts += 1;
        continue;
      }

      // If embedding isn't changing, only update Mongo/Pinecone when needed.
      if (!existing) continue; // embeddingTextChanged=false implies existing exists
      const otherFieldsChanged =
        existing.name !== nextMongoFields.name ||
        existing.slug !== nextMongoFields.slug ||
        existing.permalink !== nextMongoFields.permalink ||
        existing.category !== nextMongoFields.category ||
        existing.brand !== nextMongoFields.brand ||
        !imagesEqual(existing.images, nextMongoFields.images);

      const priceStockChanged =
        existing.price !== nextMongoFields.price ||
        existing.regular_price !== nextMongoFields.regular_price ||
        existing.sale_price !== nextMongoFields.sale_price ||
        existing.stock_quantity !== nextMongoFields.stock_quantity ||
        existing.stock_status !== nextMongoFields.stock_status ||
        existing.on_sale !== nextMongoFields.on_sale;

      if (!otherFieldsChanged && !priceStockChanged) {
        continue; // No changes at all
      }

      if (priceStockChanged && !otherFieldsChanged) {
        await Product.findOneAndUpdate(
          { id: woo.id },
          {
            $set: {
              price: nextMongoFields.price,
              regular_price: nextMongoFields.regular_price,
              sale_price: nextMongoFields.sale_price,
              stock_quantity: nextMongoFields.stock_quantity,
              stock_status: nextMongoFields.stock_status,
              on_sale: nextMongoFields.on_sale,
            },
          },
          { new: true },
        );
      } else {
        // Embedding unchanged, but metadata fields like slug/images may differ.
        await Product.findOneAndUpdate(
          { id: woo.id },
          { $set: nextMongoFields },
          { new: true },
        );
      }

      await productsNamespace.update({
        id: `product::${woo.id}`,
        metadata: {
          name: nextMongoFields.name,
          price: nextMongoFields.price,
          in_stock: isInStock(woo),
          images: images.map((img) => img.src),
          permalink: nextMongoFields.permalink,
          product_type: productType,
        },
      });

      metadataOnlyUpdates += 1;
    }

    console.log(
      `✅ Cron Completed: Woo=${wooProducts.length}, Pinecone fullUpserts=${fullUpserts}, metadataOnlyUpdates=${metadataOnlyUpdates}, removed=${removedIds.length}`,
    );
  });
};

export default startProductCron;





// import cron from "node-cron";
// import { wooApi } from "../services/wooClient";
// import fs from "fs";
// import path from "path";

// type WooProduct = {
//   id: number;
//   name?: string;
//   slug?: string;
//   permalink?: string;
//   price?: string | number | null;
//   regular_price?: string | number | null;
//   sale_price?: string | number | null;
//   stock_quantity?: number | null;
//   stock_status?: string;
//   on_sale?: boolean;
//   categories?: { id?: number; name?: string }[];
//   brands?: { id?: number; name?: string }[];
//   images?: { id?: number; src?: string }[];
// };

// // ✅ Fetch ALL products (no filters)
// const fetchWooProducts = async (): Promise<WooProduct[]> => {
//   try {
//     const perPage = 100;
//     let page = 1;
//     let allProducts: WooProduct[] = [];

//     while (true) {
//       const { data } = await wooApi.get("products", {
//         per_page: perPage,
//         page,
//         // ❌ removed filters → gets ALL products
//       });

//       const batch = (data ?? []) as WooProduct[];
//       if (!batch.length) break;

//       allProducts = [...allProducts, ...batch];
//       page++;
//     }

//     return allProducts;
//   } catch (err: any) {
//     console.error("❌ Failed to fetch Woo products:", err.message);
//     return [];
//   }
// };

// // ✅ Cron function
// const startProductCron = () => {
//   // ⏱ Run every 1 minute
//   cron.schedule("* * * * *", async () => {
//     console.log("⏳ Cron Started: Fetching ALL Woo Products...");

//     const wooProducts = await fetchWooProducts();

//     if (!wooProducts.length) {
//       console.log("⚠ No products found!");
//       return;
//     }

//     try {
//       const filePath = path.join(process.cwd(), "woo-products.json");

//       fs.writeFileSync(
//         filePath,
//         JSON.stringify(wooProducts, null, 2)
//       );

//       console.log(`✅ Saved ${wooProducts.length} products to woo-products.json`);
//     } catch (err: any) {
//       console.error("❌ Failed to save JSON:", err.message);
//     }
//   });
// };

// export default startProductCron;