import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

// Reusable Pinecone client instance
export const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Default index name (can be overridden via env)
const indexName = process.env.PINECONE_INDEX_NAME || "plantz1";

// Export the primary index
export const plantz1 = pinecone.index(indexName);

// Optional helper to work with namespaces on this index
export const getPlantz1Namespace = (namespace: string) =>
  plantz1.namespace(namespace);

