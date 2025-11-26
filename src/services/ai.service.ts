import dotenv from "dotenv";
import OpenAI from "openai";
import { HERBAL_EXPERT_PROMPT } from "../utils/prompt";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000, // 2 minutes timeout for long responses
  maxRetries: 3, // Retry failed requests up to 3 times
});

const cache = new Map<string, string>();

export class AIService {
  private assistantId: string | null = null;

  /**
   * Initialize or get existing assistant with vector store
   */
  private async getOrCreateAssistant() {
    if (this.assistantId) {
      return this.assistantId;
    }

    try {
      // Create assistant with file_search tool and vector store
      const assistant = await openai.beta.assistants.create({
        name: "Herbal Expert",
        instructions: HERBAL_EXPERT_PROMPT,
        model: "gpt-4o-mini",
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID!],
          },
        },
      });

      this.assistantId = assistant.id;
      console.log("Assistant created:", this.assistantId);
      return this.assistantId;
    } catch (error: any) {
      console.error("Error creating assistant:", error.message);
      throw error;
    }
  }

  /**
   * Non-streaming version with vector store
   */
  async getAnswer({ question }: { question: string }) {
    if (cache.has(question)) {
      return { success: true, answer: cache.get(question)! };
    }

    try {
      const assistantId = await this.getOrCreateAssistant();

      // Create a thread
      const thread = await openai.beta.threads.create();

      // Add message to thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: question,
      });

      // Run the assistant with increased timeout
      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistantId,
      });

      if (run.status === "completed") {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessage = messages.data[0];

        let answer = "";
        for (const content of assistantMessage.content) {
          if (content.type === "text") {
            answer += content.text.value;
          }
        }

        cache.set(question, answer);
        return { success: true, answer };
      } else {
        return {
          success: false,
          answer: `Run failed with status: ${run.status}`,
        };
      }
    } catch (error: any) {
      console.error("Error:", error.message);
      return { success: false, answer: "Error: Unable to get response." };
    }
  }

  /**
   * Streaming version with vector store
   */
  async getAnswerStream({ question }: { question: string }): Promise<{
    stream: AsyncIterable<any>;
    threadId: string;
  }> {
    try {
      const assistantId = await this.getOrCreateAssistant();

      // Create a thread
      const thread = await openai.beta.threads.create();

      // Add message to thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: question,
      });

      // Create a run with streaming
      const stream = openai.beta.threads.runs.stream(thread.id, {
        assistant_id: assistantId,
      });

      return {
        stream,
        threadId: thread.id,
      };
    } catch (error: any) {
      console.error("Streaming Error:", error.message);
      throw error;
    }
  }

  /**
   * Streaming version with enhanced error handling and connection recovery
   */
  async getAnswerStreamTransformed({
    question,
  }: {
    question: string;
  }): Promise<ReadableStream<string>> {
    const { stream } = await this.getAnswerStream({ question });
    let fullAnswer = "";
    let lastEventTime = Date.now();
    const HEARTBEAT_INTERVAL = 15000; // 15 seconds
    let heartbeatTimer: NodeJS.Timeout | null = null;

    return new ReadableStream<string>({
      async start(controller) {
        try {
          // Set up heartbeat monitoring to detect stale connections
          heartbeatTimer = setInterval(() => {
            const timeSinceLastEvent = Date.now() - lastEventTime;
            if (timeSinceLastEvent > HEARTBEAT_INTERVAL * 2) {
              console.warn(
                `⚠️  No events received for ${timeSinceLastEvent}ms, connection may be stale`
              );
            }
          }, HEARTBEAT_INTERVAL);

          try {
            for await (const event of stream) {
              lastEventTime = Date.now();

              // Log events for debugging (remove in production if too verbose)
              console.log(`📦 Event: ${event.event}`);

              // Handle different event types
              if (event.event === "thread.message.delta") {
                const delta = event.data.delta;

                if (delta.content) {
                  for (const content of delta.content) {
                    if (content.type === "text" && content.text?.value) {
                      const text = content.text.value;
                      fullAnswer += text;
                      controller.enqueue(text);
                    }
                  }
                }
              }

              // Handle completion
              if (event.event === "thread.message.completed") {
                console.log("✅ Message completed");
                if (fullAnswer) {
                  cache.set(question, fullAnswer);
                }
              }

              // Handle run completion
              if (event.event === "thread.run.completed") {
                console.log("✅ Run completed");
              }

              // Handle errors
              if (event.event === "thread.run.failed") {
                console.error("❌ Run failed");
                controller.error(new Error("Run failed"));
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                break;
              }

              if (event.event === "thread.run.cancelled") {
                console.error("❌ Run cancelled");
                controller.error(new Error("Run cancelled"));
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                break;
              }
            }

            // Clean up and close successfully
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            console.log(
              `✅ Stream completed. Total length: ${fullAnswer.length} chars`
            );
            controller.close();
          } catch (streamError: any) {
            // Clean up heartbeat timer
            if (heartbeatTimer) clearInterval(heartbeatTimer);

            // Handle connection termination gracefully
            const errorMessage = streamError.message?.toLowerCase() || "";
            const causeMessage =
              streamError.cause?.message?.toLowerCase() || "";

            const isConnectionError =
              errorMessage.includes("terminated") ||
              errorMessage.includes("closed") ||
              causeMessage.includes("terminated") ||
              causeMessage.includes("closed") ||
              streamError.code === "UND_ERR_SOCKET";

            if (isConnectionError) {
              console.warn(
                `⚠️  Connection terminated unexpectedly. Received ${fullAnswer.length} characters before disconnect.`
              );

              // If we got partial content, save it and close gracefully
              if (fullAnswer && fullAnswer.length > 0) {
                console.log(
                  "💾 Caching partial response and closing gracefully"
                );
                cache.set(question, fullAnswer);
                controller.close(); // Close gracefully with partial data
              } else {
                console.error(
                  "❌ Connection terminated before receiving any data"
                );
                controller.error(
                  new Error("Connection terminated before receiving any data")
                );
              }
            } else {
              // For other errors, log and throw
              console.error("❌ Unexpected stream error:", streamError);
              throw streamError;
            }
          }
        } catch (error: any) {
          console.error("❌ Stream processing error:", error);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          controller.error(error);
        }
      },

      // Add cancel handler to clean up resources
      cancel() {
        console.log("🛑 Stream cancelled by consumer");
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      },
    });
  }
}
