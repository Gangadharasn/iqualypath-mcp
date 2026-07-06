const SUGGESTIONS = [
  "Get case by ID 123",
  "Show case 2025-O-CC-10000123",
  "Get cases by impacted person Smith",
];

const WELCOME_CHAT =
  "Hi! I can help you look up enforcement cases by ID or case number. What would you like to know?";

const HISTORY_KEY_PREFIX = "qualypath-chat-history:";
const SESSIONS_KEY_PREFIX = "qualypath-chat-sessions:";
const MAX_STORED_MESSAGES = 100;
const MAX_SESSIONS = 50;
const HISTORY_RETENTION_DAYS = 14;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** @type {{ role: 'user' | 'assistant', content: string, time?: string, createdAt?: string }[]} */
let messages = [];
/** @type {{ id: string, title: string, preview: string, updatedAt: string, messages: typeof messages }[]} */
let sessions = [];
let currentSessionId = null;
let auth = { token: "", email: "" };
let isSending = false;
let panelState = "closed";
let dataLoaded = false;

const els = {
  launcher: document.getElementById("qp-launcher"),
  iconOpen: document.getElementById("qp-icon-open"),
  iconClose: document.getElementById("qp-icon-close"),
  tooltip: document.getElementById("qp-tooltip"),
  welcome: document.getElementById("qp-welcome"),
  welcomeClose: document.getElementById("qp-welcome-close"),
  welcomeHistory: document.getElementById("qp-welcome-history"),
  btnYes: document.getElementById("qp-btn-yes"),
  btnHistory: document.getElementById("qp-btn-history"),
  history: document.getElementById("qp-history"),
  historyBack: document.getElementById("qp-history-back"),
  historyClose: document.getElementById("qp-history-close"),
  historyNew: document.getElementById("qp-history-new"),
  historyList: document.getElementById("qp-history-list"),
  chat: document.getElementById("qp-chat"),
  chatBack: document.getElementById("qp-chat-back"),
  chatNew: document.getElementById("qp-chat-new"),
  chatHistory: document.getElementById("qp-chat-history"),
  chatClose: document.getElementById("qp-chat-close"),
  messages: document.getElementById("qp-messages"),
  suggestions: document.getElementById("qp-suggestions"),
  input: document.getElementById("qp-input"),
  send: document.getElementById("qp-send"),
};

function historyStorageKey() {
  return HISTORY_KEY_PREFIX + (auth.email || "anonymous").toLowerCase();
}

function sessionsStorageKey() {
  return SESSIONS_KEY_PREFIX + (auth.email || "anonymous").toLowerCase();
}

function pruneExpiredMessages(list) {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return list.filter((m) => {
    if (!m.createdAt) return true;
    return new Date(m.createdAt).getTime() >= cutoff;
  });
}

function createMessage(role, content) {
  return {
    role,
    content,
    time: nowTime(),
    createdAt: new Date().toISOString(),
  };
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sessionHasUserMessage(msgs) {
  return msgs.some((m) => m.role === "user" && m.content?.trim());
}

function sessionTitle(msgs) {
  const firstUser = msgs.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  return text.length > 52 ? `${text.slice(0, 52)}…` : text;
}

function sessionPreview(msgs) {
  const lastAssistant = [...msgs]
    .reverse()
    .find((m) => m.role === "assistant" && m.content?.trim() && m.content !== WELCOME_CHAT);
  const last = lastAssistant || [...msgs].reverse().find((m) => m.content?.trim());
  if (!last) return "";
  const text = last.content.replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function newSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadLegacyMessages() {
  try {
    const raw = localStorage.getItem(historyStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneExpiredMessages(
      parsed.filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    ).slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(sessionsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        id: String(s.id),
        title: String(s.title || "Conversation"),
        preview: String(s.preview || ""),
        updatedAt: String(s.updatedAt || new Date().toISOString()),
        messages: pruneExpiredMessages(Array.isArray(s.messages) ? s.messages : []),
      }))
      .filter((s) => sessionHasUserMessage(s.messages))
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    const sorted = [...sessions]
      .filter((s) => sessionHasUserMessage(s.messages))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_SESSIONS);
    sessions = sorted;
    localStorage.setItem(sessionsStorageKey(), JSON.stringify(sorted));
  } catch {
    // ignore
  }
}

function migrateLegacyIfNeeded() {
  const legacy = loadLegacyMessages();
  if (legacy.length === 0 || sessions.length > 0 || !sessionHasUserMessage(legacy)) return;
  sessions = [
    {
      id: newSessionId(),
      title: sessionTitle(legacy),
      preview: sessionPreview(legacy),
      updatedAt: legacy[legacy.length - 1]?.createdAt || new Date().toISOString(),
      messages: legacy,
    },
  ];
  saveSessions();
  try {
    localStorage.removeItem(historyStorageKey());
  } catch {
    // ignore
  }
}

function ensureDataLoaded() {
  if (dataLoaded) return;
  sessions = loadSessions();
  migrateLegacyIfNeeded();
  sessions = sessions.filter((s) => sessionHasUserMessage(s.messages));
  saveSessions();
  dataLoaded = true;
}

function getSession(sessionId) {
  return sessions.find((s) => s.id === sessionId);
}

function touchCurrentSession() {
  if (!currentSessionId || !sessionHasUserMessage(messages)) {
    sessions = sessions.filter(
      (s) => s.id !== currentSessionId || sessionHasUserMessage(s.messages)
    );
    saveSessions();
    return;
  }

  let session = getSession(currentSessionId);
  if (!session) {
    session = {
      id: currentSessionId,
      title: sessionTitle(messages),
      preview: sessionPreview(messages),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    sessions.unshift(session);
  }
  session.messages = messages;
  session.updatedAt = new Date().toISOString();
  session.title = sessionTitle(messages);
  session.preview = sessionPreview(messages);
  sessions = sessions.filter((s) => s.id !== currentSessionId);
  sessions.unshift(session);
  saveSessions();
}

function createNewSession() {
  currentSessionId = newSessionId();
  messages = [];
  return currentSessionId;
}

function startNewChat() {
  createNewSession();
  messages.push(createMessage("assistant", WELCOME_CHAT));
  renderMessages();
  renderSuggestions();
  setPanelState("chat");
  setTimeout(() => els.input.focus(), 200);
}

function openSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) return;
  currentSessionId = session.id;
  messages = [...session.messages];
  renderMessages(messages.length > 1);
  renderSuggestions();
  setPanelState("chat");
  setTimeout(() => els.input.focus(), 200);
}

function clearAllSessions() {
  sessions = [];
  messages = [];
  currentSessionId = null;
  saveSessions();
  try {
    localStorage.removeItem(historyStorageKey());
  } catch {
    // ignore
  }
  renderHistoryList();
  renderMessages();
  renderSuggestions();
}

function setLauncherOpen(isOpen) {
  els.launcher.classList.toggle("qp-launcher-active", isOpen);
  els.iconOpen.classList.toggle("qp-hidden", isOpen);
  els.iconClose.classList.toggle("qp-hidden", !isOpen);
  if (els.tooltip) {
    els.tooltip.textContent = isOpen ? "Close assistant" : "Ask QualyPath AI";
  }
}

const WIDGET_CLOSED_HEIGHT = 88;

function getOpenIframeHeight() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--qp-widget-open-height")
    .trim();
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 584;
}

function syncIframeHeight() {
  const height = panelState === "closed" ? WIDGET_CLOSED_HEIGHT : getOpenIframeHeight();
  window.parent.postMessage({ type: "qualypath-widget-resize", height }, "*");
}

function setPanelState(state) {
  panelState = state;
  const isOpen = state !== "closed";

  if (isOpen) syncIframeHeight();

  els.welcome.classList.toggle("qp-hidden", state !== "welcome");
  els.welcome.setAttribute("aria-hidden", state !== "welcome" ? "true" : "false");
  els.history.classList.toggle("qp-hidden", state !== "history");
  els.history.setAttribute("aria-hidden", state !== "history" ? "true" : "false");
  els.chat.classList.toggle("qp-hidden", state !== "chat");
  els.chat.setAttribute("aria-hidden", state !== "chat" ? "true" : "false");

  setLauncherOpen(isOpen);
  if (!isOpen) syncIframeHeight();
}

function openWelcome() {
  ensureDataLoaded();
  updateWelcomeHistoryButton();
  setPanelState("welcome");
}

function openHistory() {
  ensureDataLoaded();
  renderHistoryList();
  setPanelState("history");
}

function getSavableSessions() {
  return sessions.filter((s) => sessionHasUserMessage(s.messages));
}

function updateWelcomeHistoryButton() {
  if (els.btnHistory) {
    const hasHistory = getSavableSessions().length > 0;
    els.btnHistory.classList.toggle("qp-hidden", !hasHistory);
  }
}

function renderHistoryList() {
  els.historyList.innerHTML = "";
  const sorted = getSavableSessions().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  if (sorted.length === 0) {
    els.historyList.innerHTML = `
      <div class="qp-history-empty">
        <p>No conversations yet</p>
        <button type="button" class="qp-quick-btn qp-quick-btn-primary" id="qp-history-empty-start">Start chatting</button>
      </div>`;
    document.getElementById("qp-history-empty-start")?.addEventListener("click", startNewChat);
    return;
  }

  for (const session of sorted) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "qp-history-card";
    card.innerHTML = `
      <div class="qp-history-card-body">
        <div class="qp-history-card-top">
          <strong>${escapeHtml(session.title)}</strong>
          <span>${escapeHtml(formatRelativeTime(session.updatedAt))}</span>
        </div>
        <p>${escapeHtml(session.preview)}</p>
      </div>
      <svg class="qp-history-card-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 18l6-6-6-6"/>
      </svg>`;
    card.addEventListener("click", () => openSession(session.id));
    els.historyList.appendChild(card);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlineHtml(text) {
  const parts = [];
  const pattern = /\[([^\]]+)\]\(qualypath:\/\/case\/(\d+)(?:\?([^)]*))?\)/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)));
    }
    const label = match[1];
    const caseId = match[2];
    const params = new URLSearchParams(match[3] || "");
    const caseFormat = params.get("format") || "O";
    const isClosed = params.get("closed") === "1" || params.get("closed") === "true";
    const masterCase = params.get("master") === "1" || params.get("master") === "true";
    parts.push(
      `<a href="#" class="qp-case-link" data-case-id="${caseId}" data-case-number="${escapeHtml(label)}" data-case-format="${escapeHtml(caseFormat)}" data-closed="${isClosed}" data-master="${masterCase}">${escapeHtml(label)}</a>`
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.join("").replace(/\n/g, "<br>");
}

function isSuggestionBlock(block) {
  const trimmed = block.trim();
  return (
    trimmed.endsWith("?") ||
    /^(would you|do you|shall i|you can|let me know|feel free|if you|want me to|i can also|should i)/i.test(
      trimmed
    )
  );
}

function formatBlockHtml(block) {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-•*]\s+/.test(l));
  if (bulletLines.length > 0 && bulletLines.length === lines.length) {
    const items = lines
      .map((l) => {
        const text = l.replace(/^[-•*]\s+/, "");
        return `<li>${formatInlineHtml(text)}</li>`;
      })
      .join("");
    return `<ul class="qp-msg-list">${items}</ul>`;
  }
  return `<p class="qp-msg-para">${formatInlineHtml(block)}</p>`;
}

function formatAssistantMessageHtml(content) {
  const text = String(content || "").trim();
  if (!text) return "";

  const blocks = text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return `<div class="qp-msg-body">${formatBlockHtml(blocks[0] || text)}</div>`;
  }

  let endIdx = blocks.length;
  if (isSuggestionBlock(blocks[blocks.length - 1])) {
    endIdx = blocks.length - 1;
  }

  const suggestion = endIdx < blocks.length ? blocks[endIdx] : null;
  const contentBlocks = blocks.slice(0, endIdx);
  const htmlParts = ['<div class="qp-msg-body">'];

  if (contentBlocks.length > 0) {
    const intro = formatBlockHtml(contentBlocks[0]).replace(
      'class="qp-msg-para"',
      'class="qp-msg-para qp-msg-intro"'
    );
    htmlParts.push(intro);
  }

  for (const block of contentBlocks.slice(1)) {
    htmlParts.push(formatBlockHtml(block));
  }

  if (suggestion) {
    htmlParts.push(
      `<p class="qp-msg-para qp-msg-suggestion">${formatInlineHtml(suggestion)}</p>`
    );
  }

  htmlParts.push("</div>");
  return htmlParts.join("");
}

function openCaseInParent(link) {
  const caseId = Number(link.dataset.caseId);
  if (!Number.isFinite(caseId) || caseId <= 0) return;
  window.parent.postMessage(
    {
      type: "qualypath-open-case",
      caseId,
      caseNumber: link.dataset.caseNumber || "",
      caseFormat: link.dataset.caseFormat || "O",
      masterCase: link.dataset.master === "true",
      isClosed: link.dataset.closed === "true",
    },
    "*"
  );
}

function createMessageRow(msg) {
  const isUser = msg.role === "user";
  const row = document.createElement("div");
  row.className = `qp-msg-row ${isUser ? "qp-msg-row-user" : "qp-msg-row-assistant"}`;

  const wrap = document.createElement("div");
  wrap.className = "qp-msg-bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = `qp-msg-bubble ${isUser ? "qp-msg-bubble-user" : "qp-msg-bubble-assistant"}`;
  if (isUser) {
    bubble.textContent = msg.content;
  } else {
    bubble.innerHTML = formatAssistantMessageHtml(msg.content || "");
  }

  wrap.appendChild(bubble);

  const time = document.createElement("span");
  time.className = "qp-msg-time";
  time.textContent = msg.time || nowTime();
  wrap.appendChild(time);

  row.appendChild(wrap);
  return row;
}

function createTypingIndicator() {
  const row = document.createElement("div");
  row.className = "qp-typing";
  row.id = "qp-typing";
  row.innerHTML = `
    <div class="qp-typing-bubble">
      <span class="qp-typing-dot"></span>
      <span class="qp-typing-dot"></span>
      <span class="qp-typing-dot"></span>
    </div>`;
  return row;
}

function countCaseLinks(content) {
  const matches = String(content || "").match(/qualypath:\/\/case\//gi);
  return matches ? matches.length : 0;
}

function renderMessages(scrollToBottom = false, alignLatestToTop = false) {
  els.messages.innerHTML = "";
  for (const msg of messages) {
    els.messages.appendChild(createMessageRow(msg));
  }

  requestAnimationFrame(() => {
    if (alignLatestToTop) {
      const rows = els.messages.querySelectorAll(".qp-msg-row:not(.qp-msg-row-user)");
      const last = rows[rows.length - 1];
      if (last) last.scrollIntoView({ block: "start" });
    } else if (scrollToBottom) {
      els.messages.scrollTop = els.messages.scrollHeight;
    } else {
      els.messages.scrollTop = 0;
    }
  });
}

function renderSuggestions() {
  els.suggestions.innerHTML = "";
  if (messages.length > 2 || isSending) return;
  for (const text of SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qp-suggestion";
    btn.textContent = text;
    btn.addEventListener("click", () => sendMessage(text));
    els.suggestions.appendChild(btn);
  }
}

function updateSendButton() {
  els.send.disabled = !els.input.value.trim() || isSending;
}

function autoResizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 100)}px`;
}

function closePanels() {
  setPanelState("closed");
}

function toggleChat() {
  if (panelState === "closed") {
    openWelcome();
  } else {
    closePanels();
  }
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || isSending) return;

  if (!currentSessionId) {
    createNewSession();
    if (messages.length === 0) {
      messages.push(createMessage("assistant", WELCOME_CHAT));
    }
  }

  messages.push(createMessage("user", trimmed));
  touchCurrentSession();
  renderMessages(true);
  renderSuggestions();
  els.input.value = "";
  autoResizeInput();
  updateSendButton();
  isSending = true;
  els.send.disabled = true;

  const typing = createTypingIndicator();
  els.messages.appendChild(typing);
  els.messages.scrollTop = els.messages.scrollHeight;

  let latestReply = "";

  try {
    const headers = { "Content-Type": "application/json" };
    if (auth.token && auth.email) {
      headers.Authorization = `Bearer ${auth.token}:${auth.email}`;
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await response.json().catch(() => ({}));
    typing.remove();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    latestReply = data.reply;
    messages.push(createMessage("assistant", latestReply));
  } catch (error) {
    typing.remove();
    latestReply =
      error instanceof Error
        ? error.message
        : "Sorry, something went wrong. Please try again.";
    messages.push(createMessage("assistant", latestReply));
  } finally {
    isSending = false;
    updateSendButton();
    touchCurrentSession();
    const multiCase = countCaseLinks(latestReply) > 1;
    renderMessages(!multiCase, multiCase);
    renderSuggestions();
  }
}

els.messages.addEventListener("click", (event) => {
  const link = event.target.closest(".qp-case-link");
  if (!link) return;
  event.preventDefault();
  openCaseInParent(link);
});

els.launcher.addEventListener("click", toggleChat);

els.welcomeClose.addEventListener("click", closePanels);
els.welcomeHistory.addEventListener("click", openHistory);
els.btnYes.addEventListener("click", startNewChat);
els.btnHistory.addEventListener("click", openHistory);

els.historyBack.addEventListener("click", openWelcome);
els.historyClose.addEventListener("click", closePanels);
els.historyNew.addEventListener("click", startNewChat);

els.chatBack.addEventListener("click", openWelcome);
els.chatClose.addEventListener("click", closePanels);
els.chatNew.addEventListener("click", startNewChat);
els.chatHistory.addEventListener("click", openHistory);

els.send.addEventListener("click", () => sendMessage(els.input.value));

els.input.addEventListener("input", () => {
  autoResizeInput();
  updateSendButton();
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage(els.input.value);
  }
});

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "qualypath-widget-auth") return;

  const nextEmail = String(data.email || "").replace(/"/g, "");
  if (auth.email && auth.email !== nextEmail) {
    dataLoaded = false;
    sessions = [];
    messages = [];
    currentSessionId = null;
  }

  auth = {
    token: String(data.token || "").replace(/"/g, ""),
    email: nextEmail,
  };

  ensureDataLoaded();
  updateWelcomeHistoryButton();
});

window.parent.postMessage({ type: "qualypath-widget-ready" }, "*");

setPanelState("closed");
updateSendButton();
updateWelcomeHistoryButton();
