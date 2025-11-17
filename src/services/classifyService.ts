import OpenAI from "openai";
import axios from "axios";

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

const CATEGORY_MAPPING: Record<string, string> = {
  "Herbal Remedies": "General Wellness",
  Digestion: "Gastrointestinal Disorders",
  Respiratory: "Cough, Cold & Respiratory Health",
  Urinary: "Urinary Tract & Genital Health",
  Pain: "Pain & Inflammation",
  Mood: "Fatigue, Stress & Mental Performance",
  Sleep: "Sleep & Insomnia",
  Skin: "Skin Disorders",
  Accessories: "General Wellness",
  Clothing: "General Wellness",
  Rolling: "General Wellness",
  Uncategorized: "General Wellness",
};

const KEYWORD_MAPPING: Record<string, string> = {
  valerian: "Sleep & Insomnia",
  menosan: "Sleep & Insomnia",
  "stress relief": "Fatigue, Stress & Mental Performance",
  sleep: "Sleep & Insomnia",
  cough: "Cough, Cold & Respiratory Health",
  cold: "Cough, Cold & Respiratory Health",
  digest: "Loss of Appetite & Digestive Stimulation",
  urinary: "Urinary Tract & Genital Health",
  "sore throat": "Mouth & Throat Disorders",
};

const PRODUCT_CATEGORY_OVERRIDE: Record<string, string> = {
  "valdrian capsules": "Sleep & Insomnia",
  "a. vogel stress relief daytime valerian hops oral drops": "Sleep & Insomnia",
  "a. vogel menosan sage tablets": "Sleep & Insomnia",
  "a. vogel avenacalm avena sativa oral drops":
    "Fatigue, Stress & Mental Performance",
  "a. vogel agnus castus oral drops": "Gastrointestinal Disorders",
  "a. vogel cystorelief cystitis uva-ursi & echinacea oral drops":
    "Urinary Tract & Genital Health",
  "benylin herbal cough & cold sugar free syrup - pelargonium root":
    "Cough, Cold & Respiratory Health",
  "benylin herbal chesty coughs sugar free syrup - ivy extract":
    "Cough, Cold & Respiratory Health",
  "a. vogel echinaforce hot drink cold & flu echinacea concentrate":
    "Cough, Cold & Respiratory Health",
  "a. vogel echinaforce sore throat spray": "Mouth & Throat Disorders",
  "bronchoforce chesty cough ivy complex oral drops":
    "Cough, Cold & Respiratory Health",
  "a.vogel milk thistle complex tablets": "Gastrointestinal Disorders",
};

// ✅ fetch WooCommerce products dynamically
const fetchWooProducts = async () => {
  try {
    const { data } = await axios.get(`${process.env.BASE_URL}/api/products`);
    return data;
  } catch (err: any) {
    console.error("Failed to fetch WooCommerce products:", err.message);
    return [];
  }
};

export const classifyConversation = async (message: string) => {
  // Step 1: classify message
  const prompt = `
You are a medical product recommender AI.
Classify the following user message into one of these categories:
${HEALTH_CATEGORIES.join(", ")}.

User message: "${message}"

Return only the best matching category name.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  const category =
    response.choices[0].message?.content?.trim() || "General Wellness";

  // Step 2: fetch WooCommerce products from API
  const products = await fetchWooProducts();

  // Step 3: match products
  const matchedProducts = products.filter((p: any) => {
    const productName = p.name.toLowerCase();
    const productCategory = p.category;

    // 1. Hardcoded overrides
    const overrideCategory = PRODUCT_CATEGORY_OVERRIDE[productName];
    if (overrideCategory === category) return true;

    // 2. Category mapping
    const mappedCategory =
      CATEGORY_MAPPING[productCategory] || "General Wellness";
    if (mappedCategory === category) return true;

    // 3. Keyword mapping
    for (const [keyword, keywordCategory] of Object.entries(KEYWORD_MAPPING)) {
      if (
        keywordCategory === category &&
        productName.includes(keyword.toLowerCase())
      ) {
        return true;
      }
    }

    return false;
  });

  return {
    category,
    count: matchedProducts.length,
    products: matchedProducts,
  };
};
