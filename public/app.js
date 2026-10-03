const chatMessages = document.getElementById("chatMessages");
const symbolInput = document.getElementById("symbolInput");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const monitorForm = document.getElementById("monitorForm");
const settingsForm = document.getElementById("settingsForm");
const monitorList = document.getElementById("monitorList");
const alertsList = document.getElementById("alertsList");
const monitorFeedback = document.getElementById("monitorFeedback");
const monitorSymbolInput = document.getElementById("monitorSymbolInput");
const dipThresholdInput = document.getElementById("dipThresholdInput");
const notificationEmailInput = document.getElementById("notificationEmailInput");
const schedulerStatus = document.getElementById("schedulerStatus");
const nextRunValue = document.getElementById("nextRunValue");
const lastDigestValue = document.getElementById("lastDigestValue");

let monitorState = {
  monitors: [],
  settings: null,
  digest: null,
  scheduler: null,
  alerts: [],
};

function extractTickerFromText(text) {
  const matches = [...text.matchAll(/\b[A-Z]{1,6}\b/g)]
    .map((match) => match[0].toUpperCase())
    .filter((token) => token !== "I" && token !== "A" && token !== "IS" && token !== "TO" && token !== "ON");

  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

function appendMessage(role, text, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (options.isHtml) {
    bubble.innerHTML = text;
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatRequest(message, symbol) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/html",
    },
    body: JSON.stringify({ message, symbol }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(body || "Request failed");
  }

  return body;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function setFeedback(message, tone = "info") {
  monitorFeedback.textContent = message || "";
  monitorFeedback.dataset.tone = tone;
}

function renderMonitorSettings() {
  const settings = monitorState.settings;
  const digest = monitorState.digest;
  const scheduler = monitorState.scheduler;

  notificationEmailInput.value = settings?.notificationEmail || "";
  schedulerStatus.textContent = scheduler?.started ? "Active" : "Paused";
  schedulerStatus.dataset.state = scheduler?.started ? "active" : "paused";
  nextRunValue.textContent = formatDateTime(scheduler?.nextRunAt);
  lastDigestValue.textContent = formatDateTime(digest?.lastSentAt);
}

function renderMonitorList() {
  if (!monitorState.monitors.length) {
    monitorList.innerHTML = '<p class="empty-state">No stocks are being monitored yet.</p>';
    return;
  }

  monitorList.innerHTML = monitorState.monitors.map((monitor) => `
    <article class="monitor-card" data-symbol="${monitor.symbol}">
      <div class="monitor-head">
        <div>
          <strong>${monitor.symbol}</strong>
          <p>${monitor.displayName || monitor.symbol}</p>
        </div>
        <button type="button" class="remove-monitor" data-symbol="${monitor.symbol}">Remove</button>
      </div>
      <dl class="monitor-meta">
        <div>
          <dt>Threshold</dt>
          <dd>${monitor.dipThresholdPercent}%</dd>
        </div>
        <div>
          <dt>Last price</dt>
          <dd>${monitor.lastObservedPrice ?? "-"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${monitor.alertState}</dd>
        </div>
      </dl>
    </article>
  `).join("");
}

function renderAlerts() {
  if (!monitorState.alerts.length) {
    alertsList.innerHTML = '<p class="empty-state">No alerts have been captured yet.</p>';
    return;
  }

  alertsList.innerHTML = monitorState.alerts.map((alert) => `
    <article class="alert-row">
      <div class="alert-symbol">${alert.symbol}</div>
      <div class="alert-copy">
        <strong>${alert.dipPercent.toFixed(2)}% dip</strong>
        <p>${alert.reason}</p>
      </div>
      <time>${formatDateTime(alert.triggeredAt)}</time>
    </article>
  `).join("");
}

async function refreshMonitorData() {
  const [monitorResponse, settingsResponse, alertsResponse] = await Promise.all([
    fetchJson("/api/monitors"),
    fetchJson("/api/monitor-settings"),
    fetchJson("/api/alerts?limit=10"),
  ]);

  monitorState = {
    monitors: monitorResponse.monitors || [],
    settings: settingsResponse.settings || null,
    digest: settingsResponse.digest || null,
    scheduler: settingsResponse.scheduler || null,
    alerts: alertsResponse.alerts || [],
  };

  renderMonitorSettings();
  renderMonitorList();
  renderAlerts();
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  const extractedSymbol = extractTickerFromText(message);
  const symbol = (extractedSymbol || symbolInput.value.trim() || "AAPL").toUpperCase();

  if (!message) return;

  if (extractedSymbol && symbolInput.value.trim() !== extractedSymbol) {
    symbolInput.value = extractedSymbol;
  }

  appendMessage("user", `${symbol}: ${message}`);
  messageInput.value = "";
  const submitButton = chatForm.querySelector("button");
  submitButton.disabled = true;
  submitButton.textContent = "Thinking...";

  try {
    const answer = await sendChatRequest(message, symbol);
    appendMessage("bot", answer, { isHtml: true });
  } catch (error) {
    appendMessage("bot", `Error: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send";
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const symbol = chip.dataset.symbol;
    symbolInput.value = symbol;
    messageInput.focus();
  });
});

monitorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const symbol = monitorSymbolInput.value.trim().toUpperCase();
  const dipThresholdPercent = Number(dipThresholdInput.value);

  if (!symbol) {
    setFeedback("Enter a stock symbol.", "error");
    return;
  }

  try {
    await fetchJson("/api/monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, dipThresholdPercent }),
    });
    monitorSymbolInput.value = "";
    setFeedback(`${symbol} added to monitoring.`, "success");
    await refreshMonitorData();
  } catch (error) {
    setFeedback(error.message, "error");
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await fetchJson("/api/monitor-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationEmail: notificationEmailInput.value.trim() }),
    });
    setFeedback("Daily digest email saved.", "success");
    await refreshMonitorData();
  } catch (error) {
    setFeedback(error.message, "error");
  }
});

monitorList.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove-monitor");
  if (!button) {
    return;
  }

  const { symbol } = button.dataset;
  if (!symbol) {
    return;
  }

  try {
    await fetchJson(`/api/monitors/${symbol}`, { method: "DELETE" });
    setFeedback(`${symbol} removed from monitoring.`, "success");
    await refreshMonitorData();
  } catch (error) {
    setFeedback(error.message, "error");
  }
});

refreshMonitorData().catch((error) => {
  setFeedback(error.message, "error");
});
