import { HERBAL_EXPERT_PROMPT } from "./prompt";
import { AISHA_PERSONA_PROMPT } from "./aishaPrompt";

export const PERSONA_IDS = ["default", "aisha"] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export const DEFAULT_PERSONA: PersonaId = "default";

export function normalizePersona(value: unknown): PersonaId {
  if (value === "aisha") return "aisha";
  return DEFAULT_PERSONA;
}

export function getSystemPrompt(persona: PersonaId): string {
  switch (persona) {
    case "aisha":
      return AISHA_PERSONA_PROMPT;
    default:
      return HERBAL_EXPERT_PROMPT;
  }
}

export function buildContextUserMessage(
  question: string,
  context: string,
  persona: PersonaId,
): string {
  if (!context) return question;

  const contextInstructions =
    persona === "aisha"
      ? `- Prioritise the reference context above when answering.\n- If context is insufficient, say what you're unsure about and give carefully bounded guidance.\n- Apply Aisha-mode voice: warm, female-aware, evidence-led.\n- Do not mention sources, citations, or a knowledge base.`
      : `- Use only the context above to answer.\n- If the context is insufficient, say you're not sure.\n- Do not mention sources, citations, or a knowledge base.`;

  return `Context:\n${context}\n\nQuestion: ${question}\n\nInstructions:\n${contextInstructions}`;
}

export function buildCacheKey(persona: PersonaId, question: string): string {
  return `${persona}::${question}`;
}
