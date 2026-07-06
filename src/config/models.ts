export type GroqModel = {
  id: string;
  name: string;
  provider: "Meta" | "OpenAI";
  type: "chat" | "speech";
  recommended?: boolean;
};

/** Groq models available for qualypath-mcp (match Groq console). */
export const GROQ_MODELS: GroqModel[] = [
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B",
    provider: "Meta",
    type: "chat",
    recommended: true,
  },
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    provider: "Meta",
    type: "chat",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "OpenAI",
    type: "chat",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "OpenAI",
    type: "chat",
  },
  {
    id: "whisper-large-v3",
    name: "Whisper",
    provider: "OpenAI",
    type: "speech",
  },
  {
    id: "whisper-large-v3-turbo",
    name: "Whisper Large V3 Turbo",
    provider: "OpenAI",
    type: "speech",
  },
];

export const DEFAULT_GROQ_CHAT_MODEL =
  GROQ_MODELS.find((m) => m.recommended)?.id ?? "llama-3.1-8b-instant";

export function resolveGroqModel(modelId?: string): GroqModel {
  const id = modelId?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  const match = GROQ_MODELS.find((m) => m.id === id);
  if (!match) {
    const available = GROQ_MODELS.map((m) => m.id).join(", ");
    throw new Error(`Unknown GROQ_MODEL "${id}". Available: ${available}`);
  }
  return match;
}
