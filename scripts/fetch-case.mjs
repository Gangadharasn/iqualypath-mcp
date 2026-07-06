import "dotenv/config";
import https from "https";
import axios from "axios";

const caseId = Number(process.argv[2]);
if (!Number.isInteger(caseId) || caseId <= 0) {
  console.error("Usage: node scripts/fetch-case.mjs <caseId>");
  process.exit(1);
}

const token = process.env.QUALYPATH_JWT_TOKEN?.replace(/"/g, "");
const email = process.env.QUALYPATH_USER_EMAIL?.replace(/"/g, "");
const baseURL = process.env.QUALYPATH_API_URL?.trim() ?? "https://localhost:44304/api";
const tlsInsecure = process.env.QUALYPATH_TLS_INSECURE === "true";

const client = axios.create({
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  httpsAgent: tlsInsecure ? new https.Agent({ rejectUnauthorized: false }) : undefined,
});

async function refreshToken() {
  const { data } = await client.get("/home/generatetoken/admin/password", { timeout: 15000 });
  return typeof data === "string" ? data : String(data);
}

async function fetchCase(authToken, userEmail) {
  const { data } = await client.get(`/enforce/GetCase/${caseId}`, {
    headers: { Authorization: `Bearer ${authToken}:${userEmail}` },
  });
  return data;
}

try {
  let authToken = token;
  let userEmail = email;

  try {
    const data = await fetchCase(authToken, userEmail);
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    if (error.response?.status !== 401) throw error;
    authToken = await refreshToken();
    userEmail = "admin";
    const data = await fetchCase(authToken, userEmail);
    console.log(JSON.stringify(data, null, 2));
  }
} catch (error) {
  const status = error.response?.status;
  const message =
    typeof error.response?.data === "string"
      ? error.response.data
      : error.message;
  console.error(`ERROR (${status ?? "unknown"}): ${message}`);
  process.exit(1);
}
