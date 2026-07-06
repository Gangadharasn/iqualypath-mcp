import {
  getCaseById,
  searchCaseByNumber,
  searchCasesByImpactedPerson,
  searchImpactedPerson,
  searchOpenCases,
  type QualyPathAuth,
} from "../client/qualypathApi.js";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GroqTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_case_by_id",
    description:
      "Fetch full details for an enforcement case using its numeric Case ID (e.g. 143).",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "Enforcement case ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "search_case_by_number",
    description:
      "Look up an enforcement case by its case number (e.g. 2025-O-CC-10000123). Returns full case details.",
    parameters: {
      type: "object",
      properties: {
        caseNumber: {
          type: "string",
          description: "Enforcement case number",
        },
      },
      required: ["caseNumber"],
    },
  },
  {
    name: "search_cases",
    description:
      "Search open or closed enforcement cases by partial case number. Use CaseFormat A for all, O for enforcement, or C for compliance.",
    parameters: {
      type: "object",
      properties: {
        caseNumber: {
          type: "string",
          description: "Full or partial case number to search",
        },
        caseFormat: {
          type: "string",
          enum: ["A", "O", "C", "T"],
          description: "Case format filter. Use A when unsure.",
        },
        isClosed: {
          type: "boolean",
          description: "True to search closed cases, false for open cases",
        },
      },
      required: ["caseNumber"],
    },
  },
  {
    name: "get_cases_by_impacted_person",
    description:
      "Find enforcement cases linked to an impacted person (child at risk) by impacted person ID and/or first and last name.",
    parameters: {
      type: "object",
      properties: {
        impactedPersonId: {
          type: "integer",
          description: "Impacted person ID (ChildID)",
        },
        firstName: {
          type: "string",
          description: "Impacted person first name",
        },
        lastName: {
          type: "string",
          description: "Impacted person last name",
        },
      },
    },
  },
];

export function toGroqTools(): GroqTool[] {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  auth?: QualyPathAuth
): Promise<unknown> {
  switch (name) {
    case "get_case_by_id": {
      const id = Number(args.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("get_case_by_id requires a positive integer id.");
      }
      return getCaseById(id, auth);
    }
    case "search_case_by_number": {
      const caseNumber = String(args.caseNumber ?? "").trim();
      if (!caseNumber) {
        throw new Error("search_case_by_number requires a caseNumber.");
      }
      const summary = (await searchCaseByNumber(caseNumber, auth)) as {
        CaseID?: number;
      };
      if (!summary?.CaseID) {
        throw new Error(`No case found for number ${caseNumber}.`);
      }
      return getCaseById(summary.CaseID, auth);
    }
    case "search_cases": {
      const caseNumber = String(args.caseNumber ?? "").trim();
      if (!caseNumber) {
        throw new Error("search_cases requires a caseNumber.");
      }
      const caseFormat = String(args.caseFormat ?? "A");
      const isClosed = Boolean(args.isClosed);
      return searchOpenCases(caseNumber, caseFormat, isClosed, auth);
    }
    case "get_cases_by_impacted_person": {
      return getCasesByImpactedPerson(args, auth);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

type ImpactedPersonRecord = {
  ChildID?: number;
  FirstName?: string;
  LastName?: string;
  BirthDate?: string;
  ChildReferralCaseResults?: string;
};

type CaseSummary = {
  CaseID?: number;
  CaseNumber?: string;
  CaseStatusText?: string;
  CaseOpenedDate?: string;
  ChildFirstName?: string;
  ChildLastName?: string;
};

async function getCasesByImpactedPerson(
  args: Record<string, unknown>,
  auth?: QualyPathAuth
): Promise<unknown> {
  const impactedPersonId =
    args.impactedPersonId !== undefined ? Number(args.impactedPersonId) : undefined;
  let firstName = String(args.firstName ?? "").trim();
  let lastName = String(args.lastName ?? "").trim();

  if (
    (!impactedPersonId || !Number.isInteger(impactedPersonId) || impactedPersonId <= 0) &&
    !firstName &&
    !lastName
  ) {
    throw new Error(
      "get_cases_by_impacted_person requires impactedPersonId and/or firstName/lastName."
    );
  }

  const persons = (await searchImpactedPerson(
    {
      childId: impactedPersonId,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    },
    auth
  )) as ImpactedPersonRecord[];

  if (!Array.isArray(persons) || persons.length === 0) {
    return {
      impactedPersons: [],
      cases: [],
      message: "No impacted person found for the given criteria.",
    };
  }

  const searchTargets = new Map<string, ImpactedPersonRecord>();
  for (const person of persons) {
    const fn = (person.FirstName ?? firstName).trim();
    const ln = (person.LastName ?? lastName).trim();
    if (fn || ln) {
      searchTargets.set(`${fn}|${ln}`, person);
    }
  }

  const casesById = new Map<number, CaseSummary & { isClosed?: boolean }>();

  for (const [key] of searchTargets) {
    const [fn, ln] = key.split("|");
    for (const isClosed of [false, true]) {
      const results = (await searchCasesByImpactedPerson(fn, ln, isClosed, auth)) as
        | CaseSummary[]
        | null;
      if (!Array.isArray(results)) continue;
      for (const item of results) {
        if (item.CaseID) {
          casesById.set(item.CaseID, { ...item, isClosed });
        }
      }
    }
  }

  return {
    impactedPersons: persons.map((p) => ({
      ChildID: p.ChildID,
      FirstName: p.FirstName,
      LastName: p.LastName,
      BirthDate: p.BirthDate,
      ReferralCaseMapping: p.ChildReferralCaseResults ?? null,
    })),
    cases: Array.from(casesById.values()),
    totalCases: casesById.size,
  };
}
