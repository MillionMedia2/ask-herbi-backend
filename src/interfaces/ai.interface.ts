export type PersonaId = "default" | "aisha";

export interface QuestionRequest {
  question: string;
  conversationId?: string;
  persona?: PersonaId;
}

export interface AnswerResponse {
  answer: string;
  conversationId?: string;
}
