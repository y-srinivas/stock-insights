import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runStockWorkflow } from "./workflow/stockWorkflow.js";

const app = express();
const preferredPort = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "stock-insights-agent" });
});

function extractTickerFromText(text) {
  const matches = [...text.matchAll(/\b[A-Z]{1,6}\b/g)]
    .map((match) => match[0].toUpperCase())
    .filter((token) => token !== "I" && token !== "A" && token !== "IS" && token !== "TO" && token !== "ON");

  return matches.length ? matches[matches.length - 1] : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAnswerAsHtml(workflowResult, question) {
  const answer = String(workflowResult.finalAnswer || "I could not generate a stock insight for this request.");
  const answerHtml = escapeHtml(answer).replaceAll("\n", "<br>");
  const symbol = escapeHtml(workflowResult.symbol || "");
  const source = escapeHtml(workflowResult.symbolResolutionSource || "default");
  const prompt = escapeHtml(question);

  return [
    `<article class="stock-answer" data-symbol="${symbol}" data-source="${source}">`,
    `<header><strong>${symbol}</strong> <span>(resolved via ${source})</span></header>`,
    `<p>${answerHtml}</p>`,
    `<footer><small>Prompt: ${prompt}</small></footer>`,
    "</article>",
  ].join("");
}

app.post("/api/chat", async (req, res) => {
  try {
    const question = String(req.body?.message || "").trim();
    const explicitSymbol = String(req.body?.symbol || "").trim().toUpperCase();
    const inferredSymbol = extractTickerFromText(question);
    const symbolHint = (inferredSymbol || explicitSymbol || "").toUpperCase();

    if (!question) {
      return res.status(400).type("text/plain").send("A question is required.");
    }

    const workflowResult = await runStockWorkflow(symbolHint, { question });
    const html = formatAnswerAsHtml(workflowResult, question);
    return res.status(200).type("text/html").send(html);
  } catch (error) {
    console.error("Chat request failed:", error);
    return res.status(500).type("text/plain").send(error.message || "Failed to process stock analysis request.");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function startServer(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    console.log(`Stock insights chat UI is running at http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy. Retrying on ${nextPort}.`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

startServer(preferredPort);
