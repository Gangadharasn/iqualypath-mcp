import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { registerGetCaseByIdScenario, registerGetCasesByImpactedPersonScenario, registerSearchCaseByNumberScenario } from "./scenarios/getCaseById.js";
import { registerModelsScenario } from "./scenarios/models.js";

const server = new McpServer({
  name: "qualypath-mcp",
  version: "1.0.0",
});

registerModelsScenario(server);
registerGetCaseByIdScenario(server);
registerSearchCaseByNumberScenario(server);
registerGetCasesByImpactedPersonScenario(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const model = config.groqModel();
  console.error(`qualypath-mcp server running (stdio) | model: ${model.name} (${model.id})`);
}

main().catch((error) => {
  console.error("qualypath-mcp server failed:", error);
  process.exit(1);
});
