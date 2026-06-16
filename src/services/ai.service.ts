import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  buildCacheKey,
  buildContextUserMessage,
  DEFAULT_PERSONA,
  getSystemPrompt,
  normalizePersona,
  type PersonaId,
} from "../utils/personas";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const cache = new Map<string, string>();
const conversationHistory = new Map<
  string,
  OpenAI.Chat.ChatCompletionMessageParam[]
>();
const conversationMeta = new Map<string, { persona: PersonaId }>();

type PineconeHit = {
  id: string;
  chunk_text: string;
  score?: number;
};

type AskParams = {
  question: string;
  conversationId?: string;
  persona?: PersonaId;
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

  private resolvePersona(persona?: PersonaId): PersonaId {
    return normalizePersona(persona ?? DEFAULT_PERSONA);
  }

  private getOrInitMessages(
    conversationId: string | undefined,
    persona: PersonaId,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    if (
      conversationId &&
      conversationHistory.has(conversationId) &&
      conversationMeta.get(conversationId)?.persona === persona
    ) {
      return [...conversationHistory.get(conversationId)!];
    }

    if (conversationId && conversationHistory.has(conversationId)) {
      this.clearConversation(conversationId);
    }

    return [
      {
        role: "system",
        content: getSystemPrompt(persona),
      },
    ];
  }

  private saveConversationTurn(
    conversationId: string,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    persona: PersonaId,
  ): void {
    conversationHistory.set(conversationId, messages);
    conversationMeta.set(conversationId, { persona });
  }

  private async searchContext(
    question: string,
    topK: number = 5,
  ): Promise<string> {
    try {
      console.log("\n [PINECONE] Searching for:", question);
      console.log(`   Index: ${this.indexName}`);
      console.log(`   Namespace: ${this.namespace}`);
      console.log(`   Top K: ${topK}`);

      const pineconeUrl = `https://${this.indexHost}/records/namespaces/${this.namespace}/search`;

      const searchBody = {
        query: {
          inputs: { text: question },
          top_k: topK,
        },
        fields: ["text"],
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

      hits.forEach((hit: any, idx: number) => {
        const score = hit._score || hit.score || 0;
        const id = hit._id || hit.id || "unknown";
        console.log(`   ${idx + 1}. ID: ${id} | Score: ${score.toFixed(4)}`);
      });

      const MAX_CHARS = 4000;
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

  async getAnswer({ question, conversationId, persona }: AskParams) {
    const resolvedPersona = this.resolvePersona(persona);

    console.log("\n" + "=".repeat(80));
    console.log("🚀 [API CALL] Starting getAnswer");
    console.log(`🎭 [PERSONA] ${resolvedPersona}`);
    console.log("=".repeat(80));

    const cacheKey = buildCacheKey(resolvedPersona, question);
    if (cache.has(cacheKey)) {
      console.log("[CACHE] Found cached answer");
      return {
        success: true,
        answer: cache.get(cacheKey)!,
        conversationId: conversationId || undefined,
      };
    }

    try {
      const topK = this.namespace === "cannabis" ? 8 : 5;
      const context = await this.searchContext(question, topK);

      if (!context || context.length === 0) {
        console.warn(
          "[NO CONTEXT] Answering without Pinecone data - AI may use general knowledge!",
        );
      } else {
        console.log("[CONTEXT] Using Pinecone knowledge base");
      }

      const messages = this.getOrInitMessages(conversationId, resolvedPersona);

      messages.push({
        role: "user",
        content: buildContextUserMessage(question, context, resolvedPersona),
      });

      console.log("[OPENAI] Sending request to GPT-4o-mini...");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        top_p: 0.9,
      });

      const answer = response.choices[0].message.content || "";

      if (conversationId) {
        messages.push({
          role: "assistant",
          content: answer,
        });
        this.saveConversationTurn(conversationId, messages, resolvedPersona);
      }

      console.log("[OPENAI] Response received");
      console.log(`[RESPONSE] Answer length: ${answer.length} characters`);
      console.log(`[RESPONSE] Preview: ${answer.substring(0, 150)}...`);
      console.log("=".repeat(80) + "\n");

      cache.set(cacheKey, answer);

      return {
        success: true,
        answer,
        conversationId: conversationId || undefined,
      };
    } catch (error: any) {
      console.error("[ERROR]:", error.message);
      return {
        success: false,
        answer: "Error: Unable to get response.",
        conversationId: conversationId || undefined,
      };
    }
  }

  async getAnswerStream({ question, conversationId, persona }: AskParams): Promise<{
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    conversationId?: string;
    persona: PersonaId;
    userMessageContent: string;
  }> {
    const resolvedPersona = this.resolvePersona(persona);

    console.log("\n" + "=".repeat(80));
    console.log("[API CALL] Starting getAnswerStream");
    console.log(`🎭 [PERSONA] ${resolvedPersona}`);
    console.log("=".repeat(80));

    try {
      const topK = this.namespace === "cannabis" ? 8 : 5;
      const context = await this.searchContext(question, topK);

      if (!context || context.length === 0) {
        console.warn(
          "[NO CONTEXT] Streaming without Pinecone data - AI may use general knowledge!",
        );
      } else {
        console.log("[CONTEXT] Using Pinecone knowledge base for streaming");
      }

      const messages = this.getOrInitMessages(conversationId, resolvedPersona);
      const userMessageContent = buildContextUserMessage(
        question,
        context,
        resolvedPersona,
      );

      messages.push({
        role: "user",
        content: userMessageContent,
      });

      console.log("[OPENAI] Starting streaming response...");

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
      });

      return {
        stream,
        conversationId,
        persona: resolvedPersona,
        userMessageContent,
      };
    } catch (error: any) {
      console.error("[STREAMING ERROR]:", error.message);
      throw error;
    }
  }

  async getAnswerStreamTransformed({
    question,
    conversationId,
    persona,
  }: AskParams): Promise<ReadableStream<string>> {
    const {
      stream,
      conversationId: returnedConversationId,
      persona: resolvedPersona,
      userMessageContent,
    } = await this.getAnswerStream({
      question,
      conversationId,
      persona,
    });

    let fullAnswer = "";
    let chunkCount = 0;
    const finalConversationId = returnedConversationId || conversationId;

    return new ReadableStream<string>({
      async start(controller) {
        try {
          console.log("[STREAM] Starting to process chunks...");

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

            if (chunk.choices[0]?.finish_reason === "stop") {
              console.log(`[STREAM] Completed - ${chunkCount} chunks received`);
              console.log(
                `[STREAM] Total response length: ${fullAnswer.length} characters`,
              );

              if (finalConversationId && fullAnswer) {
                let messages: OpenAI.Chat.ChatCompletionMessageParam[];

                if (
                  conversationHistory.has(finalConversationId) &&
                  conversationMeta.get(finalConversationId)?.persona ===
                    resolvedPersona
                ) {
                  messages = [...conversationHistory.get(finalConversationId)!];
                } else {
                  messages = [
                    {
                      role: "system",
                      content: getSystemPrompt(resolvedPersona),
                    },
                  ];
                }

                messages.push({
                  role: "user",
                  content: userMessageContent,
                });
                messages.push({
                  role: "assistant",
                  content: fullAnswer,
                });

                conversationHistory.set(finalConversationId, messages);
                conversationMeta.set(finalConversationId, {
                  persona: resolvedPersona,
                });
              }

              if (fullAnswer) {
                cache.set(
                  buildCacheKey(resolvedPersona, question),
                  fullAnswer,
                );
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

  clearConversation(conversationId: string): void {
    if (conversationHistory.has(conversationId)) {
      conversationHistory.delete(conversationId);
      conversationMeta.delete(conversationId);
      console.log(
        `[CONVERSATION] Cleared history for conversationId: ${conversationId}`,
      );
    }
  }
}
