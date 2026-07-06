import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import { runChatAgent, type UiChatMessage } from "./chat/agent.js";
import { parseAuthHeader } from "./client/qualypathApi.js";
import { config } from "./config.js";
import { GROQ_MODELS } from "./config/models.js";

const widgetDir = path.resolve(process.cwd(), "public", "widget");

type ChatRequestBody = {
  messages?: UiChatMessage[];
};

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

app.use(
  "/widget",
  express.static(widgetDir, {
    index: "index.html",
    setHeaders(res) {
      const origin = config.corsOrigin.replace(/\/$/, "");
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors 'self' ${origin}`
      );
    },
  })
);

app.get(["/widget", "/widget/"], (_req, res) => {
  res.sendFile(path.join(widgetDir, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "qualypath-mcp-chat" });
});

app.get("/api/models", (_req, res) => {
  res.json({
    activeModel: config.groqModel(),
    models: GROQ_MODELS.filter((model) => model.type === "chat"),
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body as ChatRequestBody;
    const messages = body.messages ?? [];
    const auth = parseAuthHeader(req.header("authorization"));
    if (!auth) {
      res.status(401).json({
        error:
          "QualyPath login session is required. Sign in to QualyPath and retry.",
      });
      return;
    }

    if (messages.length === 0) {
      res.status(400).json({ error: "messages array is required." });
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user" || !lastMessage.content.trim()) {
      res.status(400).json({ error: "The last message must be a non-empty user message." });
      return;
    }

    const result = await runChatAgent(messages, auth);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    res.status(500).json({ error: message });
  }
});

const port = config.chatPort();
const model = config.groqModel();

app.listen(port, () => {
  console.log(
    `qualypath-mcp chat server running on http://localhost:${port} | model: ${model.name} (${model.id})`
  );
  console.log(`Widget embed URL: http://localhost:${port}/widget/`);
});
