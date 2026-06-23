import dotenv from "dotenv";

import { searchProducts } from "../src/services/productSearch";

dotenv.config();

async function main() {
  const query = process.argv[2] ?? "sleep supplement";
  console.log(`Querying Pinecone (read-only) for: "${query}"`);

  const results = await searchProducts(query);

  console.log(`Found ${results.length} results:`);
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
