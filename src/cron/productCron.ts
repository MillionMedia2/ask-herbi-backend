import cron from "node-cron";
import axios from "axios";
import Product from "../models/Product";

const fetchWooProducts = async () => {
  try {
    const { data } = await axios.get(`${process.env.BASE_URL}/api/products`);
    return data;
  } catch (err: any) {
    console.error("Failed to fetch WooCommerce products:", err.message);
    return [];
  }
};

const startProductCron = () => {
  // Runs once every 24 hours (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Cron Job Started: Fetching WooCommerce Products...");

    const products = await fetchWooProducts();

    if (!products.length) {
      console.log("⚠ No products found!");
      return;
    }

    for (const p of products) {
      await Product.findOneAndUpdate(
        { id: p.id }, // Match using WooCommerce product ID
        {
          $set: {
            name: p.name,
            slug: p.slug,
            permalink: p.permalink,
            price: p.price,
            regular_price: p.regular_price,
            sale_price: p.sale_price,
            stock_quantity: p.stock_quantity,
            stock_status: p.stock_status,
            on_sale: p.on_sale,
            category: p.category,
            brand: p.brand,
            images: p.images,
          },
        },
        { upsert: true, new: true } // Create if not exists
      );
    }

    console.log(`✅ Cron Completed: Synced ${products.length} products`);
  });
};

export default startProductCron;
