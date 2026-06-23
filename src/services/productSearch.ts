import { openai } from "../utils/openaiClient";
import { getPlantz1Namespace } from "../utils/pineconeClient";
import Product from "../models/Product";

const PRODUCTS_NAMESPACE = (
  process.env.PINECONE_PRODUCTS_NAMESPACE || "plantz-products"
).trim();
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = Number(
  process.env.PINECONE_EMBEDDING_DIMENSIONS ?? 1024,
);
const SIMILARITY_THRESHOLD = 0.3;

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
  regular_price?: string;
  sale_price?: string;
  in_stock: boolean;
  images: string[];
  permalink: string;
  product_type: string;
  /** WooCommerce numeric product ID (for add-to-cart) */
  wooProductId?: number;
  // plantz-products document fields (optional)
  title?: string;
  docCanonicalId?: string;
  sectionHeading?: string;
  sectionKey?: string;
  taxonomy_path?: string;
  supplier?: string;
  sku?: string;
  text?: string;
  // Human-readable representation (MVP)
  display: string;
}

type DbProductLite = {
  id: number;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price?: string;
  stock_quantity?: number | null;
  stock_status: string;
  on_sale?: boolean;
  images?: Array<{ src?: string }>;
};

async function mergeDbProductFields(
  items: RecommendedProduct[],
  namespace: string,
): Promise<RecommendedProduct[]> {
  const ns = (namespace ?? "").trim().toLowerCase();
  if (ns !== "plantz-products") return items;

  const canonicalIds = items
    .map((p) => (p.docCanonicalId ?? "").toString().trim())
    .filter(Boolean);

  if (canonicalIds.length === 0) return items;

  // In Pinecone, docCanonicalId uses underscores. In Woo/Mongo, slug is often hyphenated.
  const slugCandidates = Array.from(
    new Set([
      ...canonicalIds,
      ...canonicalIds.map((s) => s.replace(/_/g, "-")),
    ]),
  );

  const dbRows = (await Product.find(
    { slug: { $in: slugCandidates } },
    {
      id: 1,
      slug: 1,
      permalink: 1,
      price: 1,
      regular_price: 1,
      sale_price: 1,
      stock_quantity: 1,
      stock_status: 1,
      on_sale: 1,
      images: 1,
      _id: 0,
    },
  )
    .lean()
    .exec()) as unknown as DbProductLite[];

  const bySlug = new Map<string, DbProductLite>();
  for (const row of dbRows) bySlug.set(row.slug, row);

  return items.map((p) => {
    const canonical = (p.docCanonicalId ?? "").toString().trim();
    const fromDb =
      (canonical && bySlug.get(canonical)) ||
      (canonical && bySlug.get(canonical.replace(/_/g, "-")));

    if (!fromDb) return p;

    // When we have a DB match, prefer Woo/Mongo media to keep price + images in sync.
    const dbImages = (fromDb.images ?? [])
      .map((img) => img?.src ?? "")
      .filter(Boolean);
    const mergedImages = dbImages.length ? dbImages : (p.images ?? []);

    return {
      ...p,
      wooProductId: Number.isFinite(fromDb.id) ? fromDb.id : undefined,
      price: fromDb.price ?? p.price,
      regular_price: fromDb.regular_price,
      sale_price: fromDb.sale_price,
      stock_quantity: fromDb.stock_quantity,
      stock_status: fromDb.stock_status,
      permalink: fromDb.permalink || p.permalink,
      images: mergedImages,
      in_stock:
        fromDb.stock_status?.toLowerCase() === "instock" ||
        (typeof fromDb.stock_quantity === "number" &&
          fromDb.stock_quantity > 0),
    };
  });
}

function isNullString(v: unknown): boolean {
  return typeof v === "string" && v.trim().toLowerCase() === "null";
}

function formatProducts(
  matches: any[],
  maxItems: number,
  namespace: string,
): RecommendedProduct[] {
  const ns = (namespace ?? "").trim().toLowerCase();
  const isPlantzNamespace = ns === "plantz-products";
  const minScore = isPlantzNamespace ? -Infinity : SIMILARITY_THRESHOLD;

  const mapped: RecommendedProduct[] = matches
    .filter((m) => (m.score ?? 0) >= minScore)
    .map((m) => {
      const md: any = m.metadata ?? {};

      const looksLikePlantz =
        typeof md.docCanonicalId === "string" ||
        typeof md.sectionKey === "string" ||
        typeof md.taxonomy_node === "string";

      if (looksLikePlantz) {
        const title = (md.title ?? "").toString();
        const url =
          (!isNullString(md.plantz_url) && md.plantz_url
            ? md.plantz_url
            : "") ||
          (!isNullString(md.supplier_url) && md.supplier_url
            ? md.supplier_url
            : "");
        const image =
          !isNullString(md.image_url) && md.image_url ? md.image_url : "";
        const sells =
          md.plantz_sells === true ||
          md.plantz_sells === "true" ||
          md.sku_status === "active";

        return {
          score: m.score ?? 0,
          name: title || md.docCanonicalId || m.id || "",
          title,
          docCanonicalId: md.docCanonicalId,
          sectionHeading: md.sectionHeading,
          sectionKey: md.sectionKey,
          taxonomy_path: md.taxonomy_path,
          supplier: md.supplier,
          sku: md.sku,
          text: md.text,
          price: "",
          images: image ? [image] : [],
          permalink: url ?? "",
          product_type: md.product_category ?? md.taxonomy_node ?? "",
          in_stock: Boolean(sells),
          display: "",
        };
      }

      return {
        score: m.score ?? 0,
        name: md.name ?? "",
        price: md.price ?? "",
        images: Array.isArray(md.images) ? md.images : [],
        permalink: md.permalink ?? "",
        product_type: md.product_type ?? "",
        in_stock: md.in_stock ?? true,
        display: "",
      };
    });

  if (!isPlantzNamespace) {
    return mapped.slice(0, maxItems).map((p, idx) => ({
      ...p,
      display: `${idx + 1}. ${p.name}${p.price ? ` - ${p.price}` : ""}${
        p.permalink ? `\n   ${p.permalink}` : ""
      }`,
    }));
  }

  // Deduplicate by docCanonicalId so we return one entry per product (not per section chunk).
  const deduped: RecommendedProduct[] = [];
  const seen = new Set<string>();
  for (const p of mapped) {
    const key =
      (p.docCanonicalId ?? "").toString().trim() ||
      (p.sku ?? "").toString().trim() ||
      p.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
    if (deduped.length >= maxItems) break;
  }

  return deduped.map((p, idx) => ({
    ...p,
    display: `${idx + 1}. ${p.name}${p.taxonomy_path ? `\n   ${p.taxonomy_path}` : ""}${
      p.sectionHeading ? `\n   ${p.sectionHeading}` : ""
    }${p.permalink ? `\n   ${p.permalink}` : ""}`,
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

export async function recommendProducts(
  messages: AnyMessage[],
): Promise<RecommendedProduct[]> {
  // ✅ Keep last 4 messages (as you want)
  const last4 = messages.slice(-4);
  console.log("last4", last4);
  const conversationText = last4
    .map(messageToPromptLine)
    .filter(Boolean)
    .join("\n");

  // ❌ Removed GPT query generation (big latency win)

  if (!conversationText) {
    console.log("No conversation text");
    return [];
  }

  // ✅ Directly create embedding from conversation
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small", // ⚡ fastest recommended
    input: conversationText,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vector = embeddingResponse.data[0]?.embedding;
  if (!vector) {
    return [];
  }

  const productsNamespace = getPlantz1Namespace(PRODUCTS_NAMESPACE);
  console.log("[pinecone] recommend namespace =", PRODUCTS_NAMESPACE);

  const isPlantzNamespace =
    PRODUCTS_NAMESPACE.toLowerCase() === "plantz-products";

  // plantz-products uses document metadata (no `in_stock`, `price`, etc.)
  const pineconeResponse = await productsNamespace.query({
    vector,
    topK: isPlantzNamespace ? 40 : 8,
    filter: isPlantzNamespace
      ? { taxonomy_node: "herbal_products" }
      : { in_stock: true },
    includeMetadata: true,
  });

  const formatted = formatProducts(
    pineconeResponse.matches ?? [],
    40,
    PRODUCTS_NAMESPACE,
  );
  return await mergeDbProductFields(formatted, PRODUCTS_NAMESPACE);
}

export async function searchProducts(
  query: string,
): Promise<RecommendedProduct[]> {
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
  console.log("[pinecone] search namespace =", PRODUCTS_NAMESPACE);

  const isPlantzNamespace =
    PRODUCTS_NAMESPACE.toLowerCase() === "plantz-products";

  const pineconeResponse = await productsNamespace.query({
    vector,
    topK: isPlantzNamespace ? 50 : 12,
    filter: isPlantzNamespace
      ? { taxonomy_node: "herbal_products" }
      : { in_stock: true },
    includeMetadata: true,
  });

  const formatted = formatProducts(
    pineconeResponse.matches ?? [],
    12,
    PRODUCTS_NAMESPACE,
  );
  return await mergeDbProductFields(formatted, PRODUCTS_NAMESPACE);
}
