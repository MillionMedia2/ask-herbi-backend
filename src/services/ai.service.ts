import dotenv from "dotenv";
import OpenAI from "openai";
import { HERBAL_EXPERT_PROMPT } from "../utils/prompt";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
  maxRetries: 3,
});

// Store conversation history by conversation ID
const conversationStore = new Map<
  string,
  Array<{ role: string; content: string }>
>();
const cache = new Map<string, string>();

export class AIService {
  /**
   * Non-streaming version with conversation history
   */
  async getAnswer({
    question,
    conversationId,
  }: {
    question: string;
    conversationId?: string;
  }) {
    try {
      // Get or initialize conversation history
      const conversationHistory = conversationId
        ? conversationStore.get(conversationId) || []
        : [];

      // Build messages array
      const messages: Array<{ role: string; content: string }> = [
        {
          role: "system",
          content: HERBAL_EXPERT_PROMPT,
        },
        ...conversationHistory,
        {
          role: "user",
          content: question,
        },
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages as any,
      });

      const answer = completion.choices[0].message.content || "";
      const responseId = completion.id;

      // Update conversation history if conversationId provided
      if (conversationId) {
        conversationHistory.push(
          { role: "user", content: question },
          { role: "assistant", content: answer }
        );
        conversationStore.set(conversationId, conversationHistory);
        console.log(
          `💾 Saved conversation history for: ${conversationId} (${conversationHistory.length} messages)`
        );
      }

      return {
        success: true,
        answer,
        responseId,
        conversationId: conversationId || responseId, // Return conversationId for tracking
      };
    } catch (error: any) {
      console.error("Error:", error.message);
      return {
        success: false,
        answer: "Error: Unable to get response.",
        responseId: undefined,
        conversationId: undefined,
      };
    }
  }

  /**
   * Streaming version with conversation history
   */
  async getAnswerStreamTransformed({
    question,
    conversationId,
    saveHistory = true,
  }: {
    question: string;
    conversationId?: string;
    saveHistory?: boolean;
  }): Promise<ReadableStream<string>> {
    let fullAnswer = "";
    let responseId = "";

    return new ReadableStream<string>({
      async start(controller) {
        try {
          // Get or initialize conversation history
          const conversationHistory = conversationId
            ? conversationStore.get(conversationId) || []
            : [];

          // Build messages array
          const messages: Array<{ role: string; content: string }> = [
            {
              role: "system",
              content: HERBAL_EXPERT_PROMPT,
            },
            ...conversationHistory,
            {
              role: "user",
              content: question,
            },
          ];

          const stream = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages as any,
            stream: true,
            stream_options: {
              include_usage: true,
            },
          });

          for await (const chunk of stream) {
            if (chunk.id && !responseId) {
              responseId = chunk.id;
              console.log(`📝 Response ID: ${responseId}`);
              // Send conversation ID (use existing or new responseId)
              const convId = conversationId || responseId;
              controller.enqueue(`__CONVERSATION_ID__:${convId}\n`);
            }

            const delta = chunk.choices[0]?.delta?.content;

            if (delta) {
              fullAnswer += delta;
              controller.enqueue(delta);
            }

            if (chunk.choices[0]?.finish_reason === "stop") {
              console.log("✅ Stream completed");

              // Update conversation history only if saveHistory is true
              if (saveHistory && (conversationId || responseId)) {
                const convId = conversationId || responseId;
                conversationHistory.push(
                  { role: "user", content: question },
                  { role: "assistant", content: fullAnswer }
                );
                conversationStore.set(convId, conversationHistory);
                console.log(
                  `💾 Saved conversation history for: ${convId} (${conversationHistory.length} messages)`
                );
              }

              break;
            }
          }

          controller.close();
        } catch (error: any) {
          console.error("❌ Stream error:", error);
          controller.error(error);
        }
      },

      cancel() {
        console.log("🛑 Stream cancelled by consumer");
      },
    });
  }

  /**
   * Clear conversation history for a given conversationId
   */
  clearConversation(conversationId: string) {
    conversationStore.delete(conversationId);
    console.log(`🗑️  Cleared conversation: ${conversationId}`);
  }

  /**
   * Get conversation history length
   */
  getConversationLength(conversationId: string): number {
    return conversationStore.get(conversationId)?.length || 0;
  }
}
