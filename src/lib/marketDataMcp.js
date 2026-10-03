import {
  MCP_AUTH_TOKEN,
  MCP_REQUEST_TIMEOUT_MS,
  MCP_SERVER_URL,
  MCP_TOOL_STOCK_SNAPSHOT,
  MCP_TOOL_SYMBOL_SEARCH,
} from "../config.js";

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
}

function parseMaybeJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractStructuredContent(result) {
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

async function callMcpTool(toolName, args) {
  if (!MCP_SERVER_URL) {
    throw new Error("MCP_SERVER_URL is required when MARKET_DATA_PROVIDER=mcp.");
  }

  const { controller, timeoutId } = withTimeout(MCP_REQUEST_TIMEOUT_MS);

  try {
    const headers = {
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

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "MCP tool call failed");
    }

    return extractStructuredContent(payload.result);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getStockSnapshotFromMcp(symbol) {
  const result = await callMcpTool(MCP_TOOL_STOCK_SNAPSHOT, { symbol });
  if (!result || typeof result !== "object") {
    return null;
  }

  if (result.marketData && typeof result.marketData === "object") {
    return result.marketData;
  }

  return result;
}

export async function searchSymbolsFromMcp(query) {
  const result = await callMcpTool(MCP_TOOL_SYMBOL_SEARCH, { query });

  if (!result || typeof result !== "object") {
    return [];
  }

  const candidates =
    (Array.isArray(result.matches) && result.matches) ||
    (Array.isArray(result.result) && result.result) ||
    (Array.isArray(result.symbols) && result.symbols) ||
    [];

  return candidates.slice(0, 10).map((item) => ({
    symbol: item.symbol || item.ticker || "",
    description: item.description || item.name || "",
    type: item.type || "",
    displaySymbol: item.displaySymbol || item.symbol || item.ticker || "",
  }));
}
