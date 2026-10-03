import {
  MCP_AUTH_TOKEN,
  MCP_REQUEST_TIMEOUT_MS,
  MCP_SERVER_URL,
  MCP_TOOL_STOCK_SNAPSHOT,
  MCP_TOOL_SYMBOL_SEARCH,
} from "../config.js";
import type { MarketDataSnapshot, SymbolSearchResult } from "../types/marketData.d.ts";

type MappedResult = { content?: Array<{ type?: string; json?: unknown; text?: string }> };

function withTimeout(ms: number): { controller: AbortController; timeoutId: NodeJS.Timeout } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractStructuredContent(result: MappedResult | null | undefined): unknown {
  if (!result || typeof result !== "object") {
    return null;
  }

  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item?.type === "json" && item.json && typeof item.json === "object") {
        return item.json;
      }

      if (item?.type === "text" && typeof item.text === "string") {
        const parsed = parseMaybeJson(item.text);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    }
  }

  return result;
}

async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  if (!MCP_SERVER_URL) {
    throw new Error("MCP_SERVER_URL is required when MARKET_DATA_PROVIDER=mcp.");
  }

  const { controller, timeoutId } = withTimeout(MCP_REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (MCP_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${MCP_AUTH_TOKEN}`;
    }

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP HTTP ${response.status}: ${text}`);
    }

    const payload = await response.json() as { error?: { message?: string }; result?: unknown };
    if (payload.error) {
      throw new Error(payload.error.message || "MCP tool call failed");
    }

    return extractStructuredContent(payload.result);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStockSnapshotFromMcp(symbol: string): Promise<MarketDataSnapshot | null> {
  const result = await callMcpTool(MCP_TOOL_STOCK_SNAPSHOT, { symbol });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const resultObject = result as Record<string, unknown>;
  if (resultObject.marketData && typeof resultObject.marketData === "object" && !Array.isArray(resultObject.marketData)) {
    return resultObject.marketData as MarketDataSnapshot;
  }

  return resultObject as unknown as MarketDataSnapshot;
}

export async function searchSymbolsFromMcp(query: string): Promise<SymbolSearchResult[]> {
  const result = await callMcpTool(MCP_TOOL_SYMBOL_SEARCH, { query });

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return [];
  }

  const resultObject = result as Record<string, unknown>;
  const matches = Array.isArray(resultObject.matches) ? resultObject.matches : [];
  const rawResult = Array.isArray(resultObject.result) ? resultObject.result : [];
  const symbols = Array.isArray(resultObject.symbols) ? resultObject.symbols : [];

  const candidates =
    (matches.length > 0 ? matches : null) ||
    (rawResult.length > 0 ? rawResult : null) ||
    (symbols.length > 0 ? symbols : null) ||
    [];

  return candidates.slice(0, 10).map((item) => {
    const row = (item && typeof item === "object") ? item as Record<string, unknown> : {};
    return {
      symbol: String(row.symbol || row.ticker || ""),
      description: String(row.description || row.name || ""),
      type: String(row.type || ""),
      displaySymbol: String(row.displaySymbol || row.symbol || row.ticker || ""),
    };
  });
}
