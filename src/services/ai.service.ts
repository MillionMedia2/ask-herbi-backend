import dotenv from "dotenv";
dotenv.config();
const SYSTEM_PROMPT = `
You are a caring herbal expert. Recommend effective plant-based remedies from your knowledge base.
Always base answers on the vector store and show confidence levels (High/Medium/Low).
Keep answers short and clear.
`;
const cache = new Map<string, string>();
export class AIService {
  async getAnswer({ question }: { question: string }) {
    if (cache.has(question)) {
      return { success: true, answer: cache.get(question)! };
    }
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // :zap: faster model
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
          tools: [
            {
              type: "file_search",
              vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID],
            },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error("OpenAI API Error:", data);
        return { success: false, answer: "Failed to get response from AI." };
      }
      let answer = "Sorry, I couldn’t generate an answer.";
      if (Array.isArray(data.output)) {
        const messageOutput = data.output.find(
          (o: any) => o.type === "message" && o.role === "assistant"
        );
        if (messageOutput && Array.isArray(messageOutput.content)) {
          answer = messageOutput.content
            .map((c: any) => c.text)
            .filter(Boolean)
            .join("\n")
            .trim();
        }
      }
      cache.set(question, answer);
      return { success: true, answer };
    } catch (error: any) {
      console.error("Fetch Error:", error.message);
      return { success: false, answer: "Error: Unable to connect to AI API." };
    }
  }
}

// import dotenv from "dotenv";
// dotenv.config();

// export class AIService {
//   async getAnswer({ question }: { question: string }) {
//     console.log("question", question);
//     try {
//       const response = await fetch("https://api.openai.com/v1/responses", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//         },
//         body: JSON.stringify({
//           model: "gpt-4o-mini",
//           prompt: {
//             id: process.env.OPENAI_PROMPT_ID,
//             variables: {
//               user_question: question,
//             },
//           },
//           tools: [
//             {
//               type: "file_search",
//               vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID],
//             },
//           ],
//         }),
//       });

//       const data = await response.json();

//       if (!response.ok) {
//         console.error("OpenAI API Error:", data);
//         return { success: false, answer: "Failed to get response from AI." };
//       }

//       // Extract assistant message text properly
//       let answer = "Sorry, I couldn't generate an answer.";

//       if (Array.isArray(data.output)) {
//         const messageOutput = data.output.find(
//           (o: any) => o.type === "message" && o.role === "assistant"
//         );

//         if (messageOutput && Array.isArray(messageOutput.content)) {
//           answer = messageOutput.content
//             .map((c: any) => c.text)
//             .filter(Boolean)
//             .join("\n")
//             .trim();
//         }
//       }

//       return { success: true, answer };
//     } catch (error: any) {
//       console.error("Fetch Error:", error.message);
//       return { success: false, answer: "Error: Unable to connect to AI API." };
//     }
//   }
// }
