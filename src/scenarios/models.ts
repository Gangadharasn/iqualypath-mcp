import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GROQ_MODELS } from "../config/models.js";
import { config } from "../config.js";

export function registerModelsScenario(server: McpServer): void {
  server.registerResource(
    "groq-models",
    "qualypath://models/groq",
    {
      title: "Groq models",
      description: "Available Groq models for qualypath-mcp (same as Groq console).",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "qualypath://models/groq",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              activeModel: config.groqModel(),
              models: GROQ_MODELS,
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
