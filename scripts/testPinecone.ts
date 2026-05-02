import dotenv from "dotenv";

import { upsertToPinecone, searchProducts } from "../src/services/productSearch";

dotenv.config();

async function main() {
  const samples = [
    {
      id: 900001,
      name: "Valerian Sleep Remedy Herbal",
      price: "12.99",
      stock_status: "instock",
      stock_quantity: 12,
      images: [{ src: "https://example.com/valerian.jpg" }],
      permalink: "https://example.com/products/valerian-sleep-remedy",
      product_type: "supplement",
      embedding_text:
        "Valerian sleep remedy herbal insomnia stress relief valerian root calming sleep supplement Sleep & Insomnia",
    },
    {
      id: 900002,
      name: "Magnesium Glycinate Night Support",
      price: "18.50",
      stock_status: "instock",
      stock_quantity: 20,
      images: [{ src: "https://example.com/magnesium.jpg" }],
      permalink: "https://example.com/products/magnesium-glycinate-night",
      product_type: "supplement",
      embedding_text:
        "Magnesium glycinate night support relaxation muscle recovery sleep quality calming supplement Sleep & Insomnia",
    },
    {
      id: 900003,
      name: "Herbal Stress Relief Drops",
      price: "14.25",
      stock_status: "instock",
      stock_quantity: 8,
      images: [{ src: "https://example.com/stress.jpg" }],
      permalink: "https://example.com/products/herbal-stress-relief-drops",
      product_type: "tincture",
      embedding_text:
        "Herbal stress relief drops calming anxiety daytime relaxation adaptogens stress support Fatigue Stress Mental Performance",
    },
    {
      id: 900004,
      name: "Digestive Ginger Capsules",
      price: "9.99",
      stock_status: "instock",
      stock_quantity: 15,
      images: [{ src: "https://example.com/ginger.jpg" }],
      permalink: "https://example.com/products/digestive-ginger-capsules",
      product_type: "supplement",
      embedding_text:
        "Digestive ginger capsules nausea indigestion stomach comfort gut support ginger supplement Gastrointestinal Disorders",
    },
  ];

  console.log(`Upserting ${samples.length} sample products to Pinecone...`);
  for (const p of samples) {
    await upsertToPinecone(p);
  }

  console.log('Searching Pinecone for query: "sleep supplement"');
  const results = await searchProducts("sleep supplement");

  console.log(`Found ${results.length} results (after threshold):`);
  for (const r of results) {
    console.log(`\n${r.display}\n   score=${r.score.toFixed(4)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ testPinecone failed:", (err as Error).message);
    process.exit(1);
  });

