import { openai } from "../utils/openaiClient";
import { getPlantz1Namespace } from "../utils/pineconeClient";

export interface ProductSearchDocument {
  id: number | string;
  name: string;
  price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  images?: Array<{ src?: string }>;
  permalink?: string;
  product_type?: string;
  embedding_text?: string;
}

const PRODUCTS_NAMESPACE =
  process.env.PINECONE_PRODUCTS_NAMESPACE || "woocommerce Products";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = Number(process.env.PINECONE_EMBEDDING_DIMENSIONS ?? 1024);
const SIMILARITY_THRESHOLD = 0.3;

function toPineconeId(wooId: number | string): string {
  return `product::${wooId}`;
}

export async function upsertToPinecone(product: ProductSearchDocument) {
  const embeddingText = product.embedding_text?.trim();
  if (!embeddingText) {
    throw new Error("Product embedding_text is required for Pinecone upsert.");
  }

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: embeddingText,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vector = embeddingResponse.data[0]?.embedding;
  if (!vector) {
    throw new Error("Failed to generate embedding vector for product.");
  }

  const pineconeId = toPineconeId(product.id);
  const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);

  const inStock =
    product.stock_status === "instock" ||
    (typeof product.stock_quantity === "number" && product.stock_quantity > 0);

  await productsNamespace.upsert([
    {
      id: pineconeId,
      values: vector,
      metadata: {
        name: product.name ?? "",
        price: product.price ?? "",
        in_stock: inStock,
        images: (product.images ?? [])
          .map((img) => img?.src ?? "")
          .filter(Boolean),
        permalink: product.permalink ?? "",
        product_type: product.product_type ?? "",
      },
    },
  ]);

  return { id: pineconeId };
}

export async function deleteProductFromPinecone(id: number | string) {
  const pineconeId = toPineconeId(id);
  const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);
  await productsNamespace.deleteMany([pineconeId]);
  return { id: pineconeId };
}

type AnyMessage = {
  role?: string;
  senderId?: string;
  sender?: string;
  content?: string;
  message?: string;
  text?: string;
};

export interface RecommendedProduct {
  score: number;
  name: string;
  price: string;
  in_stock: boolean;
  images: string[];
  permalink: string;
  product_type: string;
  // Human-readable representation (MVP)
  display: string;
}

function formatProducts(matches: any[], maxItems: number): RecommendedProduct[] {
  const filtered = matches
    .filter((m) => (m.score ?? 0) >= SIMILARITY_THRESHOLD)
    .map((m) => {
      const md: any = m.metadata ?? {};
      return {
        score: m.score ?? 0,
        name: md.name ?? "",
        price: md.price ?? "",
        images: Array.isArray(md.images) ? md.images : [],
        permalink: md.permalink ?? "",
        product_type: md.product_type ?? "",
        in_stock: md.in_stock ?? true,
      };
    });

  return filtered.slice(0, maxItems).map((p, idx) => ({
    score: p.score,
    name: p.name,
    price: p.price,
    in_stock: p.in_stock,
    images: p.images,
    permalink: p.permalink,
    product_type: p.product_type,
    display: `${idx + 1}. ${p.name}${p.price ? ` - ${p.price}` : ""}${
      p.permalink ? `\n   ${p.permalink}` : ""
    }`,
  }));
}

function messageToPromptLine(message: AnyMessage): string {
  const content = (message.content ?? message.message ?? message.text ?? "")
    .toString()
    .trim();

  const role = (message.role ?? message.senderId ?? message.sender ?? "")
    .toString()
    .toLowerCase();

  const label = role.includes("user") ? "User" : "Herbie";
  return content ? `${label}: ${content}` : "";
}

function normalizeQueryOutput(query: string): string {
  // Remove common quoting / wrapping characters.
  return query
    .trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();
}

export async function recommendProducts(messages: AnyMessage[]): Promise<
  RecommendedProduct[]
> {
  const last6 = messages.slice(-6);

  const conversationText = last6
    .map(messageToPromptLine)
    .filter(Boolean)
    .join("\n");

  const systemPrompt =
    "You are a product search query generator. Generate a concise Pinecone search query for herbal products based on the conversation. Return ONLY the search query as plain text.";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Conversation:\n${conversationText}\n\nSearch query:`,
      },
    ],
  });

  const generatedQuery = normalizeQueryOutput(
    response.choices[0]?.message?.content ?? "",
  );

  if (!generatedQuery) {
    return [];
  }

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: generatedQuery,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vector = embeddingResponse.data[0]?.embedding;
  if (!vector) {
    return [];
  }

  const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);
  const pineconeResponse = await productsNamespace.query({
    vector,
    topK: 8,
    filter: { in_stock: true },
    includeMetadata: true,
  });

  const matches = pineconeResponse.matches ?? [];
  return formatProducts(matches, 8);
}

export async function searchProducts(query: string): Promise<RecommendedProduct[]> {
  const searchQuery = query.trim();
  if (!searchQuery) return [];

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: searchQuery,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vector = embeddingResponse.data[0]?.embedding;
  if (!vector) return [];

  const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);
  const pineconeResponse = await productsNamespace.query({
    vector,
    topK: 12,
    filter: { in_stock: true },
    includeMetadata: true,
  });

  return formatProducts(pineconeResponse.matches ?? [], 12);
}

