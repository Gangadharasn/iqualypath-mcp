import axios, { AxiosError, AxiosInstance } from "axios";
import https from "https";
import { config } from "../config.js";

export type QualyPathAuth = {
  token: string;
  email: string;
};

/** Token + email must come from the logged-in QualyPath UI session. */
export function requireSessionAuth(auth?: QualyPathAuth): QualyPathAuth {
  const token = auth?.token?.replace(/"/g, "").trim() ?? "";
  const email = auth?.email?.replace(/"/g, "").trim() ?? "";
  if (!token || !email) {
    throw new Error(
      "QualyPath login session is required. Sign in to QualyPath and retry."
    );
  }
  return { token, email };
}

function buildAuthHeader(auth: QualyPathAuth): string {
  const session = requireSessionAuth(auth);
  return `Bearer ${session.token}:${session.email}`;
}

function createClient(auth?: QualyPathAuth): AxiosInstance {
  console.log(config.apiBaseUrl);
  return axios.create({
    baseURL: config.apiBaseUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(requireSessionAuth(auth)),
    },
    httpsAgent: config.tlsInsecure
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  });
}

function mapApiError(error: unknown, context: string): never {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const message =
      typeof error.response?.data === "string"
        ? error.response.data
        : error.message;

    if (status === 401) {
      throw new Error("Unauthorized. Check your QualyPath login session.");
    }
    if (status === 404) {
      throw new Error(`${context} not found.`);
    }
    throw new Error(`QualyPath API error (${status ?? "unknown"}): ${message}`);
  }
  throw error;
}

export async function getCaseById(
  caseId: number,
  auth?: QualyPathAuth
): Promise<unknown> {
  try {
    const client = createClient(auth);
    const { data } = await client.get(`/enforce/GetCase/${caseId}`);
    return data;
  } catch (error) {
    mapApiError(error, `Case ID ${caseId}`);
  }
}

export async function searchCaseByNumber(
  caseNumber: string,
  auth?: QualyPathAuth
): Promise<unknown> {
  try {
    const client = createClient(auth);
    const { data } = await client.get(
      `/enforce/SearchCaseNumberPayments/${encodeURIComponent(caseNumber.trim())}`
    );
    return data;
  } catch (error) {
    mapApiError(error, `Case number ${caseNumber}`);
  }
}

export async function searchOpenCases(
  caseNumber: string,
  caseFormat: string,
  isClosed: boolean,
  auth?: QualyPathAuth
): Promise<unknown> {
  try {
    const client = createClient(auth);
    const { data } = await client.post(`/enforce/SearchOpenCases/${isClosed}`, {
      CaseNumber: caseNumber,
      CaseFormat: caseFormat,
    });
    return data;
  } catch (error) {
    mapApiError(error, `Case search for ${caseNumber}`);
  }
}

export type ImpactedPersonSearchParams = {
  childId?: number;
  firstName?: string;
  lastName?: string;
};

export async function searchImpactedPerson(
  params: ImpactedPersonSearchParams,
  auth?: QualyPathAuth
): Promise<unknown> {
  try {
    const client = createClient(auth);
    const body: Record<string, unknown> = {};
    if (params.childId && params.childId > 0) {
      body.ChildID = params.childId;
    }
    if (params.firstName?.trim()) {
      body.FirstName = params.firstName.trim();
    }
    if (params.lastName?.trim()) {
      body.LastName = params.lastName.trim();
    }
    const { data } = await client.post("/enforce/SearchChild", body);
    return data;
  } catch (error) {
    mapApiError(error, "Impacted person search");
  }
}

export async function searchCasesByImpactedPerson(
  firstName: string,
  lastName: string,
  isClosed: boolean,
  auth?: QualyPathAuth
): Promise<unknown> {
  try {
    const client = createClient(auth);
    const { data } = await client.post(`/enforce/SearchOpenCases/${isClosed}`, {
      CaseNumber: "",
      CaseFormat: "A",
      ChildFirstName: firstName.trim(),
      ChildLastName: lastName.trim(),
    });
    return data;
  } catch (error) {
    mapApiError(error, `Cases for impacted person ${firstName} ${lastName}`);
  }
}

export function parseAuthHeader(
  authorization?: string
): QualyPathAuth | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const value = authorization.slice("Bearer ".length).trim();
  const separator = value.lastIndexOf(":");
  if (separator <= 0) {
    return undefined;
  }

  const token = value.slice(0, separator).trim();
  const email = value.slice(separator + 1).trim();
  if (!token || !email) {
    return undefined;
  }

  return { token, email };
}
