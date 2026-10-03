import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  CreateStockAgentsOptions,
  LlmInvokeMessage,
  LlmInvokeResponse,
  ModelInvoker,
  StockWorkflowState,
} from "../types/workflow.d.ts";

import {
  GITHUB_MODELS_BASE_URL,
  GITHUB_TOKEN,
  LLM_MODEL,
  MODEL_PROVIDER,
  OLLAMA_API_KEY,
  OLLAMA_BASE_URL,
  OPENAI_API_KEY,
} from "../config.js";

const provider = MODEL_PROVIDER || "openai";
const apiKey =
  provider === "github-models"
    ? GITHUB_TOKEN
    : provider === "ollama"
      ? OLLAMA_API_KEY
      : OPENAI_API_KEY;
const configuration =
  provider === "github-models"
    ? { baseURL: GITHUB_MODELS_BASE_URL }
    : provider === "ollama"
      ? { baseURL: OLLAMA_BASE_URL }
      : undefined;

const llm = apiKey
  ? new ChatOpenAI({
      model: LLM_MODEL,
      temperature: 0.2,
      apiKey,
      ...(configuration ? { configuration } : {}),
    })
  : null;

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  }
  return String(content ?? "");
}

function buildResearchFallback(snapshot: StockWorkflowState["marketData"]): string {
  const price = snapshot.price ?? "N/A";
  const changePercent = snapshot.changePercent ?? 0;
  const sentiment = changePercent >= 0 ? "bullish" : "cautious";

  return [
    `Research summary for ${snapshot.symbol}:`,
    `- Company: ${snapshot.name}`,
    `- Price: ${price} ${snapshot.currency}`,
    `- Change: ${changePercent.toFixed(2)}% (${sentiment})`,
    `- Market cap: ${snapshot.marketCap ? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(snapshot.marketCap) : "N/A"}`,
    `- P/E ratio: ${snapshot.peRatio ?? "N/A"}`,
    `- Dividend yield: ${snapshot.dividendYield ? `${(snapshot.dividendYield * 100).toFixed(2)}%` : "N/A"}`,
    `- 52-week range: ${snapshot.fiftyTwoWeekLow ?? "N/A"} to ${snapshot.fiftyTwoWeekHigh ?? "N/A"}`,
    `- Trend view: the recent price action suggests ${sentiment} momentum with a focus on support/resistance levels from the last 30 days.`,
  ].join("\n");
}

function buildRiskFallback(snapshot: StockWorkflowState["marketData"]): string {
  const changePercent = snapshot.changePercent ?? 0;
  const volatility = Math.abs(changePercent) > 3 ? "above-average volatility" : "moderate volatility";

  return [
    `Risk perspective for ${snapshot.symbol}:`,
    `- Current trend: ${changePercent >= 0 ? "positive momentum" : "negative momentum"}`,
    `- Volatility: ${volatility}`,
    `- Watch for support/resistance around the recent price band and changes in earnings expectations.`,
    `- Position sizing should remain disciplined if the stock is moving into a high-beta phase or if earnings are near.`,
  ].join("\n");
}

function buildSummaryFallback(snapshot: StockWorkflowState["marketData"], research: string, risk: string): string {
  return [
    `Stock insight: ${snapshot.symbol} (${snapshot.name})`,
    "",
    research,
    "",
    risk,
    "",
    `Overall take: ${snapshot.symbol} appears suitable for a scenario-based review. Favor a patient entry near support unless the trend weakens materially or broader market conditions turn adverse.`,
  ].join("\n");
}

function formatValue(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value}${suffix}`;
}

function buildKeyFigures(snapshot: StockWorkflowState["marketData"]): string {
  return [
    `Key figures for ${snapshot.symbol}:`,
    `- Current price: ${formatValue(snapshot.price)} ${snapshot.currency || ""}`.trim(),
    `- Day high: ${formatValue(snapshot.dayHigh)}`,
    `- Day low: ${formatValue(snapshot.dayLow)}`,
    `- Open: ${formatValue(snapshot.open)}`,
    `- Previous close: ${formatValue(snapshot.previousClose)}`,
    `- Change: ${formatValue(snapshot.change)} (${formatValue(snapshot.changePercent, "%")})`,
    `- Market cap: ${snapshot.marketCap ? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(snapshot.marketCap) : "N/A"}`,
  ].join("\n");
}

function combineWithKeyFigures(snapshot: StockWorkflowState["marketData"], modelOrFallbackAnswer: string): string {
  return [
    buildKeyFigures(snapshot),
    "",
    modelOrFallbackAnswer,
  ].join("\n");
}

function isValidInvoker(modelInvoker: unknown): modelInvoker is ModelInvoker {
  return typeof modelInvoker === "function";
}

async function invokeModel(messages: LlmInvokeMessage[], modelInvoker: ModelInvoker | undefined): Promise<LlmInvokeResponse | null> {
  if (isValidInvoker(modelInvoker)) {
    return modelInvoker(messages);
  }

  if (!llm) {
    return null;
  }

  return llm.invoke(messages as any);
}

async function callModelWithFallback({
  prompt,
  payload,
  fallbackText,
  state,
  fieldName,
  modelInvoker,
}: {
  prompt: string;
  payload: string;
  fallbackText: string;
  state: StockWorkflowState;
  fieldName: "research" | "risk";
  modelInvoker?: ModelInvoker;
}): Promise<StockWorkflowState> {
  if (!llm && !isValidInvoker(modelInvoker)) {
    return { ...state, [fieldName]: fallbackText };
  }

  try {
    const response = await invokeModel([
      new SystemMessage(prompt),
      new HumanMessage(payload),
    ], modelInvoker);

    if (!response) {
      return { ...state, [fieldName]: fallbackText };
    }

    return { ...state, [fieldName]: toText(response.content) };
  } catch (error) {
    console.warn(`LLM request failed for ${fieldName}. Falling back to rule-based response.`, error?.message || error);
    return { ...state, [fieldName]: fallbackText };
  }
}

export function createStockAgents(options: CreateStockAgentsOptions = {}) {
  const modelInvoker = options.modelInvoker;

  async function researchAgentImpl(state: StockWorkflowState): Promise<StockWorkflowState> {
    const snapshot = state.marketData;
    const researchPrompt = `You are a fundamental research analyst. Review the stock data and give a concise investment summary with trend, valuation, and momentum notes.`;
    const fallback = buildResearchFallback(snapshot);

    return callModelWithFallback({
      prompt: researchPrompt,
      payload: JSON.stringify(snapshot, null, 2),
      fallbackText: fallback,
      state,
      fieldName: "research",
      modelInvoker,
    });
  }

  async function riskAgentImpl(state: StockWorkflowState): Promise<StockWorkflowState> {
    const snapshot = state.marketData;
    const riskPrompt = `You are a risk analyst. Identify downside risks, volatility, and portfolio risk concerns for this stock using the market snapshot.`;
    const fallback = buildRiskFallback(snapshot);

    return callModelWithFallback({
      prompt: riskPrompt,
      payload: JSON.stringify(snapshot, null, 2),
      fallbackText: fallback,
      state,
      fieldName: "risk",
      modelInvoker,
    });
  }

  async function summaryAgentImpl(state: StockWorkflowState): Promise<StockWorkflowState> {
    const snapshot = state.marketData;
    const summaryPrompt = `You are a portfolio strategist. Produce a final analysis that blends trend, valuation, and risk into a single actionable answer.`;
    const fallback = buildSummaryFallback(snapshot, state.research, state.risk);

    try {
      const response = await invokeModel([
        new SystemMessage(summaryPrompt),
        new HumanMessage(`Research:\n${state.research}\n\nRisk:\n${state.risk}`),
      ], modelInvoker);

      if (!response) {
        return { ...state, finalAnswer: combineWithKeyFigures(snapshot, fallback) };
      }

      return { ...state, finalAnswer: combineWithKeyFigures(snapshot, toText(response.content)) };
    } catch (error) {
      console.warn("LLM summary request failed. Falling back to rule-based summary.", error?.message || error);
      return { ...state, finalAnswer: combineWithKeyFigures(snapshot, fallback) };
    }
  }

  return {
    researchAgent: researchAgentImpl,
    riskAgent: riskAgentImpl,
    summaryAgent: summaryAgentImpl,
  };
}

const defaultAgents = createStockAgents();

export const researchAgent = defaultAgents.researchAgent;
export const riskAgent = defaultAgents.riskAgent;
export const summaryAgent = defaultAgents.summaryAgent;
