import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StockWorkflowState } from "./types/workflow.d.ts";

import { FileMonitorRepository } from "./monitoring/fileMonitorRepository.ts";
import { EmailDigestNotifier } from "./monitoring/emailDigestNotifier.ts";
import { MonitorScheduler } from "./monitoring/monitorScheduler.ts";
import { MonitorService } from "./monitoring/monitorService.ts";
import { createMonitorRouter } from "./routes/monitorRoutes.ts";
import { runStockWorkflow } from "./workflow/stockWorkflow.ts";

const app = express();
const preferredPort = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");
const monitorRepository = new FileMonitorRepository();
const monitorService = new MonitorService({
  repository: monitorRepository,
  notifier: new EmailDigestNotifier(),
});
const monitorScheduler = new MonitorScheduler(monitorService);

app.use(express.json());
app.use(express.static(publicDir));
app.use("/api", createMonitorRouter({ monitorService, monitorScheduler }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "stock-insights-agent",
    monitoring: monitorScheduler.getStatus(),
  });
});

function extractTickerFromText(text: string): string | null {
  const matches = [...text.matchAll(/\b[A-Z]{1,6}\b/g)]
    .map((match) => match[0].toUpperCase())
    .filter((token) => token !== "I" && token !== "A" && token !== "IS" && token !== "TO" && token !== "ON");

  return matches.length ? matches[matches.length - 1] : null;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAnswerAsHtml(workflowResult: StockWorkflowState, question: string): string {
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

    const workflowResult = (await runStockWorkflow(symbolHint, { question })) as StockWorkflowState;
    const html = formatAnswerAsHtml(workflowResult, question);
    return res.status(200).type("text/html").send(html);
  } catch (error) {
    console.error("Chat request failed:", error);
    const message = error instanceof Error ? error.message : "Failed to process stock analysis request.";
    return res.status(500).type("text/plain").send(message);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function startServer(port: number, attemptsLeft = 10): void {
  const server = app.listen(port, () => {
    monitorScheduler.start();
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
