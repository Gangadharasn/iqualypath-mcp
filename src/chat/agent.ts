import type { QualyPathAuth } from "../client/qualypathApi.js";
import { createChatCompletion } from "./groq.js";
import { executeTool, toGroqTools } from "../tools/registry.js";

export type UiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatAgentResult = {
  reply: string;
};

const SYSTEM_PROMPT = `You are the QualyPath Enforcement Assistant embedded in the QualyPath web application.

Help users look up and understand enforcement cases, referrals, properties, investigators, and related records.

Tool usage:
- When a user provides a case number (e.g. 2025-O-CC-10000123), call search_case_by_number.
- When a user provides a numeric case ID, call get_case_by_id.
- When a user asks for cases by impacted person, child at risk, or child name/ID, call get_cases_by_impacted_person.
- Use tools to fetch real data before answering case-specific questions. Do not invent data.

Response style — plain readable text, no cards or tables:
- NEVER use tables, markdown tables, or card-style boxed content.
- Use a short opening sentence, then bullet points for case details.
- Use "- " at the start of each bullet line (the UI renders these as a list).
- Use a blank line (double newline) between the opening, bullet block, and suggestion.

Response structure:

SINGLE CASE:
Line 1: One friendly opening sentence.
Then bullet points (each on its own line starting with "- "):
- Case number as a clickable link
- Status (open/closed)
- Opened date
- Child or impacted person (if available)
- Property address (if available)
- Investigator (if available)
Final line: One suggestion ending with a question.

MULTIPLE CASES:
Line 1: Opening sentence with total count found.
Optional line 2: Brief summary of the group.
Then for EACH case, a bullet block separated by a blank line:
- Case number link
- Status, date, and one key detail per case
Final line: Suggestion question.

Case links — required on case numbers:
[2022-O-22-10000111](qualypath://case/123?format=O&closed=0&master=0)

If nothing is found: opening + clear message + suggestion to verify spelling.`;

const MAX_TOOL_ITERATIONS = 6;

export async function runChatAgent(
  history: UiChatMessage[],
  auth: QualyPathAuth
): Promise<ChatAgentResult> {
  const tools = toGroqTools();
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  for (let step = 0; step < MAX_TOOL_ITERATIONS; step += 1) {
    const completion = await createChatCompletion(messages, tools);
    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("Groq returned no completion choices.");
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply =
        assistantMessage.content?.trim() || "I could not generate a response.";
      return { reply };
    }

    for (const toolCall of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        parsedArgs = {};
      }

      let result: unknown;
      try {
        result = await executeTool(toolCall.function.name, parsedArgs, auth);
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : "Tool execution failed.",
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("The assistant needed too many tool calls. Please try a simpler question.");
}
