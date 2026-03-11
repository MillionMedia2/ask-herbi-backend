import OpenAI from "openai";
import Product from "../models/Product";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const HEALTH_CATEGORIES = [
  "Sleep & Insomnia",
  "Pain & Inflammation",
  "Gastrointestinal Disorders",
  "Skin Disorders",
  "Cough, Cold & Respiratory Health",
  "Loss of Appetite & Digestive Stimulation",
  "Urinary Tract & Genital Health",
  "Circulatory & Cardiovascular Support",
  "Mouth & Throat Disorders",
  "Fatigue, Stress & Mental Performance",
  "General Wellness",
];

// Map categories to related categories for broader matching
const RELATED_CATEGORIES: Record<string, string[]> = {
  "Sleep & Insomnia": ["Fatigue, Stress & Mental Performance"],
  "Pain & Inflammation": ["Mouth & Throat Disorders", "Skin Disorders"],
  "Gastrointestinal Disorders": ["Loss of Appetite & Digestive Stimulation"],
  "Skin Disorders": ["Pain & Inflammation"],
  "Cough, Cold & Respiratory Health": ["Mouth & Throat Disorders"],
  "Loss of Appetite & Digestive Stimulation": ["Gastrointestinal Disorders"],
  "Urinary Tract & Genital Health": [],
  "Circulatory & Cardiovascular Support": [
    "Fatigue, Stress & Mental Performance",
  ],
  "Mouth & Throat Disorders": [
    "Cough, Cold & Respiratory Health",
    "Pain & Inflammation",
  ],
  "Fatigue, Stress & Mental Performance": ["Sleep & Insomnia"],
  "General Wellness": [], // No automatic related categories
};

const CATEGORY_MAPPING: Record<string, string[]> = {
  "Herbal Remedies": [], // Don't auto-map to General Wellness
  Digestion: [
    "Gastrointestinal Disorders",
    "Loss of Appetite & Digestive Stimulation",
  ],
  Respiratory: ["Cough, Cold & Respiratory Health", "Mouth & Throat Disorders"],
  Urinary: ["Urinary Tract & Genital Health"],
  Pain: ["Pain & Inflammation", "Mouth & Throat Disorders"],
  Mood: ["Fatigue, Stress & Mental Performance", "Sleep & Insomnia"],
  Sleep: ["Sleep & Insomnia", "Fatigue, Stress & Mental Performance"],
  Skin: ["Skin Disorders"],
  Heart: ["Circulatory & Cardiovascular Support"],
  Appetite: [
    "Loss of Appetite & Digestive Stimulation",
    "Gastrointestinal Disorders",
  ],
};

// Expanded keyword mapping with more terms
const KEYWORD_MAPPING: Record<string, string[]> = {
  // Sleep & Insomnia
  sleep: ["Sleep & Insomnia"],
  insomnia: ["Sleep & Insomnia"],
  valerian: ["Sleep & Insomnia"],
  dormeasan: ["Sleep & Insomnia"],
  night: ["Sleep & Insomnia"],

  // Pain & Inflammation
  pain: ["Pain & Inflammation"],
  ache: ["Pain & Inflammation"],
  sore: ["Pain & Inflammation", "Mouth & Throat Disorders"],
  arnica: ["Pain & Inflammation"],
  bumps: ["Pain & Inflammation", "Skin Disorders"],
  bruises: ["Pain & Inflammation", "Skin Disorders"],

  // Respiratory
  cough: ["Cough, Cold & Respiratory Health"],
  cold: ["Cough, Cold & Respiratory Health"],
  respiratory: ["Cough, Cold & Respiratory Health"],
  broncho: ["Cough, Cold & Respiratory Health"],
  throat: ["Mouth & Throat Disorders", "Cough, Cold & Respiratory Health"],
  echinacea: ["Cough, Cold & Respiratory Health"],
  pelargonium: ["Cough, Cold & Respiratory Health"],

  // Digestive
  digest: [
    "Gastrointestinal Disorders",
    "Loss of Appetite & Digestive Stimulation",
  ],
  stomach: ["Gastrointestinal Disorders"],
  appetite: ["Loss of Appetite & Digestive Stimulation"],
  "milk thistle": ["Gastrointestinal Disorders"],
  dandelion: ["Loss of Appetite & Digestive Stimulation"],
  ginger: ["Gastrointestinal Disorders"], // Added ginger
  nausea: ["Gastrointestinal Disorders"],

  // Stress & Mental
  stress: ["Fatigue, Stress & Mental Performance"],
  anxiety: ["Fatigue, Stress & Mental Performance"],
  calm: ["Fatigue, Stress & Mental Performance"],
  mood: ["Fatigue, Stress & Mental Performance"],
  mental: ["Fatigue, Stress & Mental Performance"],

  // Urinary
  urinary: ["Urinary Tract & Genital Health"],
  cystitis: ["Urinary Tract & Genital Health"],
  bladder: ["Urinary Tract & Genital Health"],

  // Skin
  skin: ["Skin Disorders"],
  wound: ["Skin Disorders"],
  cuts: ["Skin Disorders"],
  calendula: ["Skin Disorders"],
};

const PRODUCT_CATEGORY_OVERRIDE: Record<string, string[]> = {
  "valdrian capsules": ["Sleep & Insomnia"],
  "a. vogel stress relief daytime valerian hops oral drops": [
    "Fatigue, Stress & Mental Performance",
    "Sleep & Insomnia",
  ],
  "a. vogel menosan sage tablets": ["Sleep & Insomnia"],
  "a. vogel avenacalm avena sativa oral drops": [
    "Fatigue, Stress & Mental Performance",
  ],
  "a. vogel agnus castus oral drops": ["Gastrointestinal Disorders"],
  "a. vogel cystorelief cystitis uva-ursi & echinacea oral drops": [
    "Urinary Tract & Genital Health",
  ],
  "benylin herbal cough & cold sugar free syrup - pelargonium root": [
    "Cough, Cold & Respiratory Health",
  ],
  "benylin herbal chesty coughs sugar free syrup - ivy extract": [
    "Cough, Cold & Respiratory Health",
  ],
  "a. vogel echinaforce hot drink cold & flu echinacea concentrate": [
    "Cough, Cold & Respiratory Health",
  ],
  "a. vogel echinaforce sore throat spray": [
    "Mouth & Throat Disorders",
    "Pain & Inflammation",
  ],
  "bronchoforce chesty cough ivy complex oral drops": [
    "Cough, Cold & Respiratory Health",
  ],
  "a.vogel milk thistle complex tablets": ["Gastrointestinal Disorders"],
  "weleda arnica bumps and bruises spray": [
    "Pain & Inflammation",
    "Skin Disorders",
  ],
  "weleda hypercal wound salve st john's wort & calendula": ["Skin Disorders"],
};

interface ProductScore {
  product: any;
  score: number;
  matchReasons: string[];
}

export const classifyConversation = async (message: string) => {
  // Step 1: Use AI to identify ALL relevant categories
  const prompt = `
You are a medical product recommender AI. Analyze the following user message and identify ALL relevant health categories it relates to.

User message: "${message}"

Available categories:
${HEALTH_CATEGORIES.join("\n")}

Instructions:
1. Identify the PRIMARY category (most relevant)
2. Identify ANY secondary categories that are also relevant
3. Only use "General Wellness" if the query is truly generic (like "general health products" or "wellness supplements")
4. If asking about a specific herb/ingredient (like ginger, turmeric), categorize by its PRIMARY medical use
5. Be specific - prefer specific categories over "General Wellness"
6. Return as JSON with format: {"primary": "category name", "secondary": ["category1", "category2"]}

Example 1: "I have a sore throat from coughing"
{"primary": "Cough, Cold & Respiratory Health", "secondary": ["Mouth & Throat Disorders", "Pain & Inflammation"]}

Example 2: "What are the benefits of ginger?"
{"primary": "Gastrointestinal Disorders", "secondary": ["Loss of Appetite & Digestive Stimulation"]}

Example 3: "I want general wellness products"
{"primary": "General Wellness", "secondary": []}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  let primaryCategory = "General Wellness";
  let secondaryCategories: string[] = [];

  try {
    const result = JSON.parse(response.choices[0].message?.content || "{}");
    primaryCategory = result.primary || "General Wellness";
    secondaryCategories = result.secondary || [];
  } catch (error) {
    console.error("Error parsing AI response:", error);
  }

  // Add related categories only if NOT General Wellness
  const allCategories = new Set([primaryCategory, ...secondaryCategories]);

  if (primaryCategory !== "General Wellness") {
    const relatedCats = RELATED_CATEGORIES[primaryCategory] || [];
    relatedCats.forEach((cat) => allCategories.add(cat));
  }

  // Step 2: Fetch all herbal products
  const products = await Product.find({});

  // Step 3: Score and match products
  const scoredProducts: ProductScore[] = products.map((product: any) => {
    const productName = product.name.toLowerCase();
    const productCategory = product.category;
    let score = 0;
    const matchReasons: string[] = [];

    // Check hardcoded overrides (highest priority)
    const overrideCategories = PRODUCT_CATEGORY_OVERRIDE[productName];
    if (overrideCategories) {
      for (const cat of overrideCategories) {
        if (allCategories.has(cat)) {
          score += cat === primaryCategory ? 10 : 5;
          matchReasons.push(`Direct match: ${cat}`);
        }
      }
    }

    // Check category mapping
    const mappedCategories = CATEGORY_MAPPING[productCategory] || [];
    for (const cat of mappedCategories) {
      if (allCategories.has(cat)) {
        score += cat === primaryCategory ? 7 : 3;
        matchReasons.push(`Category: ${productCategory} → ${cat}`);
      }
    }

    // Check keyword mapping
    for (const [keyword, keywordCategories] of Object.entries(
      KEYWORD_MAPPING,
    )) {
      if (productName.includes(keyword.toLowerCase())) {
        for (const cat of keywordCategories) {
          if (allCategories.has(cat)) {
            score += cat === primaryCategory ? 5 : 2;
            matchReasons.push(`Keyword: ${keyword} → ${cat}`);
          }
        }
      }
    }

    return { product, score, matchReasons };
  });

  // Filter products with score > 0 and sort by score
  let matchedProducts = scoredProducts
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  // Fallback: If no products matched and it's a health query, return top General Wellness products
  if (matchedProducts.length === 0 && primaryCategory === "General Wellness") {
    // Get products from Herbal Remedies category as fallback
    const fallbackProducts = scoredProducts
      .filter((p) => p.product.category === "Herbal Remedies")
      .slice(0, 10) // Limit to 10 products
      .map((p) => ({
        product: p.product,
        score: 1,
        matchReasons: ["General wellness fallback"],
      }));

    matchedProducts = fallbackProducts;
  }

  // If General Wellness was the primary category and we have matches, limit to top 10
  if (primaryCategory === "General Wellness" && matchedProducts.length > 10) {
    matchedProducts = matchedProducts.slice(0, 10);
  }

  const finalProducts = matchedProducts.map((p) => ({
    ...p.product.toObject(),
    _matchScore: p.score,
    _matchReasons: p.matchReasons,
  }));

  return {
    primary: primaryCategory,
    secondary: secondaryCategories,
    allCategories: Array.from(allCategories),
    count: finalProducts.length,
    products: finalProducts,
  };
};

// pinecone
// import OpenAI from "openai";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY!,
// });

// // Pinecone configuration
// const PINECONE_INDEX_HOST =
//   process.env.PINECONE_INDEX_HOST ||
//   "plantz1-aokppsg.svc.gcp-europe-west4-de1d.pinecone.io";
// const PINECONE_PRODUCTS_NAMESPACE =
//   process.env.PINECONE_PRODUCTS_NAMESPACE || "cannabis_products";

// type PineconeProductHit = {
//   id: string;
//   chunk_text: string;
//   score?: number;
// };

// type ParsedProduct = {
//   id: number;
//   name: string;
//   slug: string;
//   permalink: string;
//   price: string;
//   regular_price: string;
//   sale_price?: string;
//   stock_quantity?: number | null;
//   stock_status: string;
//   on_sale: boolean;
//   category: string;
//   brand: string;
//   images: {
//     id: number;
//     src: string;
//   }[];
// };

// /**
//  * Parse product text from Pinecone into structured format
//  */
// function parseProductFromText(text: string, recordId: string): ParsedProduct {
//   // Extract product name
//   const productMatch = text.match(/Product:\s*([^\n]+)/);
//   const name = productMatch ? productMatch[1].trim() : "Unknown Product";

//   // Extract SKU
//   const skuMatch = text.match(/\*\*Sku\*\*:\s*([^\n]+)/);
//   const sku = skuMatch ? skuMatch[1].trim() : "";

//   // Extract Brand
//   const brandMatch = text.match(/\*\*Brand\*\*:\s*([^\n]+)/);
//   const brand = brandMatch ? brandMatch[1].trim() : "";

//   // Extract Product Form (category)
//   const categoryMatch = text.match(/\*\*Product Form\*\*:\s*([^\n]+)/);
//   const category = categoryMatch ? categoryMatch[1].trim() : "General";

//   // Extract Price & Quantity
//   const priceMatch = text.match(
//     /\*\*Price & Quantity\*\*:\s*£([\d.]+)\s+for\s+(\d+)g/
//   );
//   const price = priceMatch ? priceMatch[1] : "0";
//   const quantity = priceMatch ? parseInt(priceMatch[2]) : null;

//   // Extract THC percentage (for additional info if needed)
//   const thcMatch = text.match(/\*\*THC\*\*:\s*([^\n]+)/);
//   const thc = thcMatch ? thcMatch[1].trim() : "";

//   // Extract CBD percentage
//   const cbdMatch = text.match(/\*\*CBD\*\*:\s*([^\n]+)/);
//   const cbd = cbdMatch ? cbdMatch[1].trim() : "";

//   // Generate slug from name
//   const slug = name
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/(^-|-$)/g, "");

//   // Generate numeric ID from record ID (hash or use index)
//   // Using a simple hash of the record ID for consistency
//   const numericId = recordId.split("").reduce((acc, char) => {
//     return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
//   }, 0);
//   const id = Math.abs(numericId);

//   // Parse price
//   const regularPrice = price;
//   const salePrice = undefined; // No sale price in Pinecone data
//   const onSale = false;

//   // Stock status (assume in stock if product exists)
//   const stockStatus = "instock";
//   const stockQuantity = quantity;

//   return {
//     id,
//     name,
//     slug,
//     permalink: `/product/${slug}`,
//     price: `£${price}`,
//     regular_price: `£${regularPrice}`,
//     sale_price: salePrice,
//     stock_quantity: stockQuantity,
//     stock_status: stockStatus,
//     on_sale: onSale,
//     category,
//     brand,
//     images: [], // No images in Pinecone data, add empty array
//   };
// }

// /**
//  * Search Pinecone for products using integrated embeddings
//  * Matches exact implementation from pinecone-main project
//  */
// async function searchProductsInPinecone(
//   query: string,
//   topK: number = 8
// ): Promise<PineconeProductHit[]> {
//   try {
//     console.log(`🔍 [PINECONE PRODUCTS] Searching for: "${query}"`);
//     console.log(`   Top K: ${topK}`);

//     const pineconeUrl = `https://${PINECONE_INDEX_HOST}/records/namespaces/${PINECONE_PRODUCTS_NAMESPACE}/search`;

//     const searchBody = {
//       query: {
//         inputs: { text: query },
//         top_k: topK,
//       },
//       fields: ["text"], // keep payload small
//     };

//     const pineconeResponse = await fetch(pineconeUrl, {
//       method: "POST",
//       headers: {
//         "Api-Key": process.env.PINECONE_API_KEY!,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(searchBody),
//     });

//     if (!pineconeResponse.ok) {
//       const errorText = await pineconeResponse.text();
//       const reqId =
//         pineconeResponse.headers.get("x-request-id") ||
//         pineconeResponse.headers.get("x-vercel-id") ||
//         "n/a";
//       console.error("❌ [PINECONE PRODUCTS ERROR]:", {
//         status: pineconeResponse.status,
//         url: pineconeUrl,
//         namespace: PINECONE_PRODUCTS_NAMESPACE,
//         top_k: searchBody.query.top_k,
//         fields: searchBody.fields,
//         request_id: reqId,
//         body: errorText,
//       });
//       throw new Error(
//         `Pinecone product search failed (${pineconeResponse.status}) reqId=${reqId}: ${errorText}`
//       );
//     }

//     const pineconeData = await pineconeResponse.json();
//     const hits = pineconeData.result?.hits || [];

//     console.log(`📊 [PINECONE PRODUCTS] Found ${hits.length} matches`);

//     // Log matches with scores
//     hits.forEach((hit: any, idx: number) => {
//       const score = hit._score || hit.score || 0;
//       const id = hit._id || hit.id || "unknown";
//       console.log(`   ${idx + 1}. ID: ${id} | Score: ${score.toFixed(4)}`);
//     });

//     const MAX_CHARS = 4000;
//     const products: PineconeProductHit[] = hits
//       .map((hit: any): PineconeProductHit | null => {
//         const fullText = hit.fields?.text || "";
//         const chunk_text =
//           fullText.length > MAX_CHARS ? fullText.slice(0, MAX_CHARS) : fullText;
//         return {
//           id: hit._id || hit.id || "",
//           chunk_text,
//           score: hit._score || hit.score,
//         };
//       })
//       .filter(
//         (p: PineconeProductHit | null): p is PineconeProductHit =>
//           p !== null && p.chunk_text.length > 0
//       );

//     console.log(
//       `✅ [PINECONE PRODUCTS] Returning ${products.length} products\n`
//     );

//     return products;
//   } catch (error: any) {
//     console.error("❌ [PINECONE PRODUCTS ERROR]:", error.message);
//     throw error;
//   }
// }

// export const classifyConversation = async (message: string) => {
//   try {
//     // Search Pinecone for products using semantic search
//     const pineconeHits = await searchProductsInPinecone(message, 8);

//     // Take top 5 products (matching pinecone-main behavior)
//     const topProducts = pineconeHits.slice(0, 5);

//     // Parse products from Pinecone text data
//     const parsedProducts: ParsedProduct[] = topProducts.map((hit) =>
//       parseProductFromText(hit.chunk_text, hit.id)
//     );

//     return {
//       category: "Pinecone Matched",
//       count: parsedProducts.length,
//       products: parsedProducts,
//       scores: topProducts.map((hit) => ({
//         id: hit.id,
//         score: hit.score,
//       })),
//     };
//   } catch (error: any) {
//     console.error("[CLASSIFY ERROR]:", error.message);
//     return {
//       category: "Error",
//       count: 0,
//       products: [],
//       error: error.message,
//     };
//   }
// };
