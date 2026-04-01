import dotenv from "dotenv";
import mongoose from "mongoose";

import connectDB from "../src/config/db";
import Product from "../src/models/Product";
import { buildEmbeddingText } from "../src/utils/buildEmbeddingText";

dotenv.config();

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function mapConditionsFromCategory(category?: string): string[] {
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

  // Fallback: at least store the category name.
  if (conditions.length === 0) conditions.push(category?.trim() ?? "");

  return uniq(conditions);
}

function mapBodySystemsFromCategory(category?: string): string[] {
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

  return uniq(bodySystems);
}

async function main() {
  await connectDB();

  const total = await Product.countDocuments({});
  console.log(`Found ${total} products`);

  let updated = 0;
  const cursor = Product.find({}).cursor();

  for await (const product of cursor) {
    const embeddingText = buildEmbeddingText(product);
    const conditions = mapConditionsFromCategory(product.category);
    const bodySystems = mapBodySystemsFromCategory(product.category);

    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          embedding_text: embeddingText,
          conditions,
          body_systems: bodySystems,
        },
      },
    );
    updated += 1;

    // Keep logs readable.
    if (updated % 25 === 0) {
      console.log(`Updated ${updated}/${total}`);
    }
  }

  console.log(`✅ Completed embedding update. Updated ${updated}/${total} products`);
  await mongoose.connection.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed to update products embedding:", (err as Error).message);
    process.exit(1);
  });

