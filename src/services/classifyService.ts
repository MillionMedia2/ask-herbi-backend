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
      KEYWORD_MAPPING
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
