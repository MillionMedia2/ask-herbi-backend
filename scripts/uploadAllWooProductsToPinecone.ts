import dotenv from "dotenv";
import mongoose from "mongoose";

import connectDB from "../src/config/db";
import Product from "../src/models/Product";
import { upsertToPinecone } from "../src/services/productSearch";

dotenv.config();

async function main() {
  await connectDB();

  const namespace =
    process.env.PINECONE_PRODUCTS_NAMESPACE || "woocommerce Products";
  console.log(`Uploading all products to Pinecone namespace: "${namespace}"`);

  const total = await Product.countDocuments({});
  console.log(`Found ${total} products in MongoDB`);

  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  const cursor = Product.find({}).cursor();

  for await (const p of cursor) {
    processed += 1;

    const embeddingText = (p.embedding_text ?? "").trim();
    if (!embeddingText) {
      skipped += 1;
      continue;
    }

    await upsertToPinecone({
      id: p.id,
      name: p.name,
      price: p.price,
      stock_status: p.stock_status,
      stock_quantity: p.stock_quantity ?? null,
      images: (p.images ?? []).map((img) => ({ src: img.src })),
      permalink: p.permalink,
      product_type: "woocommerce",
      embedding_text: embeddingText,
    });

    upserted += 1;

    if (processed % 50 === 0) {
      console.log(
        `Progress ${processed}/${total} | upserted=${upserted} skipped=${skipped}`,
      );
    }
  }

  console.log(
    `✅ Done. processed=${processed} upserted=${upserted} skipped=${skipped}`,
  );
  await mongoose.connection.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ uploadAllWooProductsToPinecone failed:", err);
    process.exit(1);
  });

