import express from "express";
import {
  getRecommendedProducts,
  getSearchedProducts,
} from "../controllers/recommendController";

const router = express.Router();

router.post("/recommend-products", getRecommendedProducts);
router.post("/search-products", getSearchedProducts);

export default router;

