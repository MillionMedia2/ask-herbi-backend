import { groq } from "../utils/groqClient";
import { QuestionRequest, AnswerResponse } from "../interfaces/ai.interface";

export class AIService {
  async getAnswer({ question }: QuestionRequest): Promise<AnswerResponse> {
    const prompt = `
    You are an intelligent AI assistant. Please answer the following question clearly in 3 to 4 sentences.
    Question: ${question}
    `;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b", // fast, accurate model
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "Sorry, I couldn’t generate an answer.";
    return { answer };
  }
}
