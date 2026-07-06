import { config } from "../config.js";
import type { GroqTool } from "../tools/registry.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  name?: string;
};

export type GroqToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type GroqAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: GroqToolCall[];
};

export type GroqChatResponse = {
  choices: Array<{
    message: GroqAssistantMessage;
    finish_reason: string;
  }>;
};

export async function createChatCompletion(
  messages: Array<Record<string, unknown>>,
  tools: GroqTool[]
): Promise<GroqChatResponse> {
  const apiKey = config.groqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the chat server.");
  }

  const model = config.groqModel().id;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API error (${response.status}): ${body}`);
  }

  return (await response.json()) as GroqChatResponse;
}
