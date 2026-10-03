const chatMessages = document.getElementById("chatMessages");
const symbolInput = document.getElementById("symbolInput");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");

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
