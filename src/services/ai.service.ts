import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { HERBAL_EXPERT_PROMPT } from "../utils/prompt";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const cache = new Map<string, string>();
const conversationHistory = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

// Type definitions
type PineconeHit = {
  id: string;
  chunk_text: string;
  score?: number;
};

export class AIService {
  private indexName: string;
  private indexHost: string;
  private namespace: string;
  private pc: Pinecone;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || "plantz1";
    this.indexHost =
      process.env.PINECONE_INDEX_HOST ||
      "plantz1-aokppsg.svc.gcp-europe-west4-de1d.pinecone.io";
    this.namespace = process.env.PINECONE_NAMESPACE || "herb_monographs";
    this.pc = pinecone;
  }

  /**
   * Search Pinecone using integrated embeddings (REST API)
   * Matches exact implementation from pinecone-main project
   */
  private async searchContext(
    question: string,
    topK: number = 5,
  ): Promise<string> {
    try {
      console.log("\n [PINECONE] Searching for:", question);
      console.log(`   Index: ${this.indexName}`);
      console.log(`   Namespace: ${this.namespace}`);
      console.log(`   Top K: ${topK}`);

      // Exact same REST API call as pinecone-main
      const pineconeUrl = `https://${this.indexHost}/records/namespaces/${this.namespace}/search`;

      const searchBody = {
        query: {
          inputs: { text: question },
          top_k: topK,
        },
        fields: ["text"], // keep payload small (same as main)
      };

      console.log("🔄 [PINECONE] Making REST API call...");

      const pineconeResponse = await fetch(pineconeUrl, {
        method: "POST",
        headers: {
          "Api-Key": process.env.PINECONE_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchBody),
      });

      if (!pineconeResponse.ok) {
        const errorText = await pineconeResponse.text();
        const reqId =
          pineconeResponse.headers.get("x-request-id") ||
          pineconeResponse.headers.get("x-vercel-id") ||
          "n/a";
        console.error("[PINECONE ERROR]:", {
          status: pineconeResponse.status,
          url: pineconeUrl,
          namespace: this.namespace,
          top_k: searchBody.query.top_k,
          fields: searchBody.fields,
          request_id: reqId,
          body: errorText,
        });
        throw new Error(
          `Pinecone search failed (${pineconeResponse.status}) reqId=${reqId}: ${errorText}`,
        );
      }

      const pineconeData = await pineconeResponse.json();
      const hits = pineconeData.result?.hits || [];

      console.log(`📊 [PINECONE] Found ${hits.length} total matches`);

      // Log all matches with scores (same format as main)
      hits.forEach((hit: any, idx: number) => {
        const score = hit._score || hit.score || 0;
        const id = hit._id || hit.id || "unknown";
        console.log(`   ${idx + 1}. ID: ${id} | Score: ${score.toFixed(4)}`);
      });

      // Exact same parsing as pinecone-main (no score filtering)
      const MAX_CHARS = 4000; // Same as main
      const sources: PineconeHit[] = hits
        .map((hit: any): PineconeHit | null => {
          const fullText = hit.fields?.text || "";
          const chunk_text =
            fullText.length > MAX_CHARS
              ? fullText.slice(0, MAX_CHARS)
              : fullText;
          return {
            id: hit._id || hit.id || "",
            chunk_text,
            score: hit._score || hit.score,
          };
        })
        .filter(
          (s: PineconeHit | null): s is PineconeHit =>
            s !== null && s.chunk_text.length > 0,
        );

      // Same context joining format as main: \n\n---\n\n
      const context = sources
        .map((s: PineconeHit) => s.chunk_text)
        .join("\n\n---\n\n");

      console.log(`[PINECONE] Using ${sources.length} matches`);
      console.log(
        `📝 [PINECONE] Total context length: ${context.length} characters\n`,
      );

      if (sources.length === 0) {
        console.warn("[WARNING] No relevant context found");
      }

      return context;
    } catch (error: any) {
      console.error("[PINECONE ERROR]:", error.message);
      console.error("   Full error:", error);
      return "";
    }
  }

  /**
   * Non-streaming version with Pinecone
   * Matches pinecone-main settings exactly
   */
  async getAnswer({ 
    question, 
    conversationId 
  }: { 
    question: string;
    conversationId?: string;
  }) {
    console.log("\n" + "=".repeat(80));
    console.log("🚀 [API CALL] Starting getAnswer");
    console.log("=".repeat(80));

    if (cache.has(question)) {
      console.log("[CACHE] Found cached answer");
      return { 
        success: true, 
        answer: cache.get(question)!,
        conversationId: conversationId || undefined
      };
    }

    try {
      // Determine top_k based on namespace (same logic as main)
      const topK = this.namespace === "cannabis" ? 8 : 5;

      // Get relevant context from Pinecone
      const context = await this.searchContext(question, topK);

      if (!context || context.length === 0) {
        console.warn(
          "[NO CONTEXT] Answering without Pinecone data - AI may use general knowledge!",
        );
      } else {
        console.log("[CONTEXT] Using Pinecone knowledge base");
      }

      // Get conversation history if conversationId exists
      let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (conversationId && conversationHistory.has(conversationId)) {
        // Use existing conversation history
        messages = [...conversationHistory.get(conversationId)!];
      } else {
        // Start new conversation with system prompt
        messages = [
          {
            role: "system",
            content: HERBAL_EXPERT_PROMPT,
          },
        ];
      }

      // Add user message with context
      messages.push({
        role: "user",
        content: context
          ? `Context:\n${context}\n\nQuestion: ${question}\n\nInstructions:\n- Use only the context above to answer.\n- If the context is insufficient, say you're not sure.\n- Do not mention sources, citations, or a knowledge base.`
          : question,
      });

      console.log("[OPENAI] Sending request to GPT-4o-mini...");

      // Exact same OpenAI settings as pinecone-main
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Same model
        messages,
        temperature: 0.7, // Same temperature
        top_p: 0.9, // Same top_p (was missing before)
      });

      const answer = response.choices[0].message.content || "";

      // Add assistant response to conversation history
      if (conversationId) {
        messages.push({
          role: "assistant",
          content: answer,
        });
        conversationHistory.set(conversationId, messages);
      }

      console.log("[OPENAI] Response received");
      console.log(`[RESPONSE] Answer length: ${answer.length} characters`);
      console.log(`[RESPONSE] Preview: ${answer.substring(0, 150)}...`);
      console.log("=".repeat(80) + "\n");

      cache.set(question, answer);

      return { 
        success: true, 
        answer,
        conversationId: conversationId || undefined
      };
    } catch (error: any) {
      console.error("[ERROR]:", error.message);
      return { 
        success: false, 
        answer: "Error: Unable to get response.",
        conversationId: conversationId || undefined
      };
    }
  }

  /**
   * Streaming version with Pinecone
   * Matches pinecone-main settings exactly
   */
  async getAnswerStream({ 
    question, 
    conversationId 
  }: { 
    question: string;
    conversationId?: string;
  }): Promise<{
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    conversationId?: string;
  }> {
    console.log("\n" + "=".repeat(80));
    console.log("[API CALL] Starting getAnswerStream");
    console.log("=".repeat(80));

    try {
      // Determine top_k based on namespace (same logic as main)
      const topK = this.namespace === "cannabis" ? 8 : 5;

      // Get relevant context from Pinecone
      const context = await this.searchContext(question, topK);

      if (!context || context.length === 0) {
        console.warn(
          "[NO CONTEXT] Streaming without Pinecone data - AI may use general knowledge!",
        );
      } else {
        console.log("[CONTEXT] Using Pinecone knowledge base for streaming");
      }

      // Get conversation history if conversationId exists
      let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (conversationId && conversationHistory.has(conversationId)) {
        // Use existing conversation history
        messages = [...conversationHistory.get(conversationId)!];
      } else {
        // Start new conversation with system prompt
        messages = [
          {
            role: "system",
            content: HERBAL_EXPERT_PROMPT,
          },
        ];
      }

      // Add user message with context
      messages.push({
        role: "user",
        content: context
          ? `Context:\n${context}\n\nQuestion: ${question}\n\nInstructions:\n- Use only the context above to answer.\n- If the context is insufficient, say you're not sure.\n- Do not mention sources, citations, or a knowledge base.`
          : question,
      });

      console.log("[OPENAI] Starting streaming response...");

      // Exact same OpenAI settings as pinecone-main
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Same model
        messages,
        temperature: 0.7, // Same temperature
        top_p: 0.9, // Same top_p
        stream: true,
      });

      return { stream, conversationId };
    } catch (error: any) {
      console.error("[STREAMING ERROR]:", error.message);
      throw error;
    }
  }

  /**
   * Streaming version with custom ReadableStream for easier consumption
   */
  async getAnswerStreamTransformed({
    question,
    conversationId,
  }: {
    question: string;
    conversationId?: string;
  }): Promise<ReadableStream<string>> {
    const { stream, conversationId: returnedConversationId } = await this.getAnswerStream({ 
      question,
      conversationId 
    });
    let fullAnswer = "";
    let chunkCount = 0;
    const finalConversationId = returnedConversationId || conversationId;

    return new ReadableStream<string>({
      async start(controller) {
        try {
          console.log("[STREAM] Starting to process chunks...");

          // Send conversationId at the start if it exists
          if (finalConversationId) {
            controller.enqueue(`__CONVERSATION_ID__:${finalConversationId}`);
          }

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;

            if (content) {
              fullAnswer += content;
              chunkCount++;
              controller.enqueue(content);
            }

            // Check if stream is done
            if (chunk.choices[0]?.finish_reason === "stop") {
              console.log(`[STREAM] Completed - ${chunkCount} chunks received`);
              console.log(
                `[STREAM] Total response length: ${fullAnswer.length} characters`,
              );

              // Save to conversation history if conversationId exists
              if (finalConversationId && fullAnswer) {
                const messages = conversationHistory.get(finalConversationId) || [
                  {
                    role: "system",
                    content: HERBAL_EXPERT_PROMPT,
                  },
                ];
                
                // Add user message if not already added
                const lastMessage = messages[messages.length - 1];
                if (lastMessage?.role !== "user") {
                  messages.push({
                    role: "user",
                    content: question,
                  });
                }
                
                // Add assistant response
                messages.push({
                  role: "assistant",
                  content: fullAnswer,
                });
                
                conversationHistory.set(finalConversationId, messages);
              }

              if (fullAnswer) {
                cache.set(question, fullAnswer);
                console.log("💾 [CACHE] Response cached");
              }
              console.log("=".repeat(80) + "\n");
            }
          }

          controller.close();
        } catch (error) {
          console.error("[STREAM PROCESSING ERROR]:", error);
          controller.error(error);
        }
      },
    });
  }

  /**
   * Clear conversation history for a given conversationId
   */
  clearConversation(conversationId: string): void {
    if (conversationHistory.has(conversationId)) {
      conversationHistory.delete(conversationId);
      console.log(`[CONVERSATION] Cleared history for conversationId: ${conversationId}`);
    }
  }
}
