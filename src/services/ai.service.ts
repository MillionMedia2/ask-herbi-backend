import dotenv from "dotenv";
import OpenAI from "openai";
import { HERBAL_EXPERT_PROMPT } from "../utils/prompt";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

      // Run the assistant
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
   * Streaming version with custom ReadableStream for easier consumption
   */
  async getAnswerStreamTransformed({
    question,
  }: {
    question: string;
  }): Promise<ReadableStream<string>> {
    const { stream } = await this.getAnswerStream({ question });
    let fullAnswer = "";

    return new ReadableStream<string>({
      async start(controller) {
        try {
          for await (const event of stream) {
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
              if (fullAnswer) {
                cache.set(question, fullAnswer);
              }
            }

            // Handle errors
            if (event.event === "thread.run.failed") {
              controller.error(new Error("Run failed"));
              break;
            }
          }

          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      },
    });
  }
}
