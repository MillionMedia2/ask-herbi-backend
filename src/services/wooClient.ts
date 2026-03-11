import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import dotenv from "dotenv";
dotenv.config();

export const wooApi = new WooCommerceRestApi({
  url: process.env.WOO_URL!,
  consumerKey: process.env.WOO_KEY!,
  consumerSecret: process.env.WOO_SECRET!,
  version: "wc/v3",
});
