export type CaseTableRow = {
  caseId: number;
  caseNumber: string;
  createdDate: string;
  childName: string;
  caseFormat: string;
  isClosed: boolean;
  masterCase: boolean;
};

type ApiCase = Record<string, unknown>;

function formatDate(value: unknown): string {
  if (!value) {
    return "—";
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function childNameFromCase(caseRecord: ApiCase): string {
  const first = String(caseRecord.ChildFirstName ?? "").trim();
  const last = String(caseRecord.ChildLastName ?? "").trim();
  if (first || last) {
    return `${first} ${last}`.trim();
  }

  const referrals = caseRecord.Referrals;
  if (Array.isArray(referrals) && referrals.length > 0) {
    const referral = referrals[0] as ApiCase;
    const referralFirst = String(referral.PersonsAtRiskFirstName ?? "").trim();
    const referralLast = String(referral.PersonsAtRiskLastName ?? "").trim();
    if (referralFirst || referralLast) {
      return `${referralFirst} ${referralLast}`.trim();
    }
  }

  return "—";
}

function rowFromCase(caseRecord: ApiCase): CaseTableRow | null {
  const caseId = Number(caseRecord.CaseID);
  if (!Number.isFinite(caseId) || caseId <= 0) {
    return null;
  }

  return {
    caseId,
    caseNumber: String(caseRecord.CaseNumber ?? "").trim() || `Case ${caseId}`,
    createdDate: formatDate(caseRecord.CreatedDate ?? caseRecord.CaseOpenedDate),
    childName: childNameFromCase(caseRecord),
    caseFormat: String(caseRecord.CaseFormat ?? "O"),
    isClosed: Boolean(caseRecord.CaseClosedDate),
    masterCase: Boolean(caseRecord.MasterCase),
  };
}

export function extractCasesFromToolResult(result: unknown): CaseTableRow[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const record = result as Record<string, unknown>;
  if ("error" in record) {
    return [];
  }

  if (Array.isArray(record.cases)) {
    return record.cases.flatMap((item) => {
      const row = rowFromCase(item as ApiCase);
      return row ? [row] : [];
    });
  }

  if (Array.isArray(result)) {
    return result.flatMap((item) => {
      const row = rowFromCase(item as ApiCase);
      return row ? [row] : [];
    });
  }

  if (record.CaseID) {
    const row = rowFromCase(record);
    return row ? [row] : [];
  }

  return [];
}

export function dedupeCaseRows(rows: CaseTableRow[]): CaseTableRow[] {
  const byId = new Map<number, CaseTableRow>();
  for (const row of rows) {
    byId.set(row.caseId, row);
  }
  return Array.from(byId.values());
}
