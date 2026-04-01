export interface ProductForEnrichment {
  name?: string;
  short_description?: string;
  categories?: Array<string | { name?: string }>;
}

export interface EnrichedProduct {
  name: string;
  cleaned_description: string;
  ingredients: string[];
  categories: string[];
  embedding_text: string;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIngredients(cleanedDescription: string): string[] {
  // MVP: look for "ingredients: ...", then split by common separators.
  const match = cleanedDescription.match(
    /ingredients?\s*[:\-]\s*([^.;\n]+)/i,
  );

  if (!match?.[1]) return [];

  return match[1]
    .split(/,|\/|\+| and /i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategories(
  categories?: Array<string | { name?: string }>,
): string[] {
  if (!categories || categories.length === 0) return [];

  return categories
    .map((cat) => (typeof cat === "string" ? cat : cat?.name ?? ""))
    .map((name) => name.trim())
    .filter(Boolean);
}

export function enrichProduct(product: ProductForEnrichment): EnrichedProduct {
  const name = product.name?.trim() ?? "";
  const cleanedDescription = stripHtml(product.short_description ?? "");
  const ingredients = extractIngredients(cleanedDescription);
  const categories = normalizeCategories(product.categories);

  const embeddingText = [
    name,
    cleanedDescription,
    ingredients.join(" "),
    categories.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name,
    cleaned_description: cleanedDescription,
    ingredients,
    categories,
    embedding_text: embeddingText,
  };
}

