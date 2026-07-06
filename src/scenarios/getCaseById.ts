import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getCaseById,
  type QualyPathAuth,
} from "../client/qualypathApi.js";
import { executeTool } from "../tools/registry.js";

/**
 * Cursor MCP has no UI session. Credentials may be supplied via mcp.json env.
 * The chat widget never uses this — it always uses the logged-in user session.
 */
function authForMcpTools(): QualyPathAuth {
  const token = process.env.QUALYPATH_JWT_TOKEN?.replace(/"/g, "").trim() ?? "";
  const email = process.env.QUALYPATH_USER_EMAIL?.replace(/"/g, "").trim() ?? "";
  if (!token || !email) {
    throw new Error(
      "Cursor MCP tools need QUALYPATH_JWT_TOKEN and QUALYPATH_USER_EMAIL in mcp.json env. The chat widget uses the QualyPath UI login session instead."
    );
  }
  return { token, email };
}

export function registerGetCaseByIdScenario(server: McpServer): void {
  server.registerTool(
    "get_case_by_id",
    {
      title: "Get enforcement case by ID",
      description:
        "Fetch a single enforcement case from QualyPath using GET /api/enforce/GetCase/{ID}.",
      inputSchema: {
        id: z.number().int().positive().describe("Enforcement case ID"),
      },
    },
    async ({ id }) => {
      const caseData = await getCaseById(id, authForMcpTools());

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(caseData, null, 2),
          },
        ],
      };
    }
  );
}

export function registerSearchCaseByNumberScenario(server: McpServer): void {
  server.registerTool(
    "search_case_by_number",
    {
      title: "Search enforcement case by case number",
      description:
        "Look up an enforcement case by its case number (e.g. 2025-O-CC-10000123) and return full details.",
      inputSchema: {
        caseNumber: z.string().min(1).describe("Enforcement case number"),
      },
    },
    async ({ caseNumber }) => {
      const caseData = await executeTool(
        "search_case_by_number",
        { caseNumber },
        authForMcpTools()
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(caseData, null, 2),
          },
        ],
      };
    }
  );
}

export function registerGetCasesByImpactedPersonScenario(server: McpServer): void {
  server.registerTool(
    "get_cases_by_impacted_person",
    {
      title: "Get cases by impacted person",
      description:
        "Find enforcement cases linked to an impacted person by ID and/or first and last name.",
      inputSchema: {
        impactedPersonId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Impacted person ID (ChildID)"),
        firstName: z.string().optional().describe("Impacted person first name"),
        lastName: z.string().optional().describe("Impacted person last name"),
      },
    },
    async ({ impactedPersonId, firstName, lastName }) => {
      const result = await executeTool(
        "get_cases_by_impacted_person",
        {
          impactedPersonId,
          firstName,
          lastName,
        },
        authForMcpTools()
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
