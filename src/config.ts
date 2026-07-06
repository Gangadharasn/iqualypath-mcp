import { DEFAULT_GROQ_CHAT_MODEL, resolveGroqModel } from "./config/models.js";

export const config = {
  apiBaseUrl: process.env.QUALYPATH_API_URL?.trim() ?? "https://localhost:44304/api",
  tlsInsecure: process.env.QUALYPATH_TLS_INSECURE === "true",
  groqApiKey: () => process.env.GROQ_API_KEY?.trim() ?? "",
  groqModel: () => resolveGroqModel(process.env.GROQ_MODEL ?? DEFAULT_GROQ_CHAT_MODEL),
  chatPort: () => Number(process.env.CHAT_PORT ?? 3100),
  corsOrigin: process.env.CORS_ORIGIN?.trim() ?? "http://localhost:3000",
};
