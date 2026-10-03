import finnhub from "finnhub";

import { DEFAULT_SYMBOL, FINNHUB_API_KEY, MARKET_DATA_PROVIDER } from "../config.js";
import { getStockSnapshotFromMcp, searchSymbolsFromMcp } from "./marketDataMcp.js";

function logProvider(operation, provider, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.info(`[market-data] ${operation} provider=${provider}${suffix}`);
}

function createFinnhubClient() {
  // Support both SDK shapes:
  // 1) CommonJS samples exposing ApiClient.instance.authentications.api_key
  // 2) ESM build exposing only DefaultApi(apiKey)
  if (finnhub?.ApiClient?.instance?.authentications?.api_key) {
    const apiKeyAuth = finnhub.ApiClient.instance.authentications.api_key;
    apiKeyAuth.apiKey = FINNHUB_API_KEY;
    return new finnhub.DefaultApi();
  }

  return new finnhub.DefaultApi(FINNHUB_API_KEY);
}

function buildFallbackSnapshot(symbolName) {
  const basePrice = 100 + (symbolName.length % 10) * 4;

  return {
    symbol: symbolName,
    name: symbolName,
    price: basePrice,
    previousClose: basePrice - 2.5,
    change: 2.5,
    changePercent: 2.5,
    dayHigh: basePrice + 1.8,
    dayLow: basePrice - 1.6,
    open: basePrice - 0.5,
    marketCap: 500000000,
    currency: "USD",
    peRatio: null,
    dividendYield: null,
    fiftyTwoWeekHigh: basePrice + 25,
    fiftyTwoWeekLow: basePrice - 18,
    isMarketOpen: true,
    chartPoints: Array.from({ length: 10 }, (_, index) => ({
      timestamp: Date.now() / 1000 - (9 - index) * 86400,
      close: Number((basePrice - 2 + index * 1.5).toFixed(2)),
    })),
    fallback: true,
  };
}

function buildChartPoints(candleData) {
  if (!candleData || candleData.s !== "ok" || !Array.isArray(candleData.t)) {
    return [];
  }

  return candleData.t.map((timestamp, index) => ({
    timestamp,
    close: candleData.c?.[index] ?? null,
  }));
}

function looksLikeTicker(value) {
  return /^[A-Z]{1,6}$/.test(String(value || "").trim().toUpperCase());
}

function buildSearchQuery(symbolHint, question) {
  const symbolText = String(symbolHint || "").trim();
  if (symbolText && !looksLikeTicker(symbolText)) {
    return symbolText;
  }

  const text = String(question || "").trim();
  if (!text) {
    return "";
  }

  const compact = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Finnhub symbolSearch behaves best with concise search strings.
  return compact.split(" ").slice(-3).join(" ");
}

export async function getStockSnapshot(symbol) {
  const symbolName = String(symbol || "AAPL").trim().toUpperCase();

  if (MARKET_DATA_PROVIDER === "mcp") {
    logProvider("snapshot", "mcp", `symbol=${symbolName}`);
    try {
      const mcpData = await getStockSnapshotFromMcp(symbolName);

      if (mcpData && typeof mcpData === "object") {
        return {
          symbol: symbolName,
          name: mcpData.name || symbolName,
          price: mcpData.price ?? null,
          previousClose: mcpData.previousClose ?? null,
          change: mcpData.change ?? null,
          changePercent: mcpData.changePercent ?? null,
          dayHigh: mcpData.dayHigh ?? null,
          dayLow: mcpData.dayLow ?? null,
          open: mcpData.open ?? null,
          marketCap: mcpData.marketCap ?? null,
          currency: mcpData.currency || "USD",
          peRatio: mcpData.peRatio ?? null,
          dividendYield: mcpData.dividendYield ?? null,
          fiftyTwoWeekHigh: mcpData.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: mcpData.fiftyTwoWeekLow ?? null,
          isMarketOpen: mcpData.isMarketOpen ?? true,
          chartPoints: Array.isArray(mcpData.chartPoints) ? mcpData.chartPoints : [],
          fallback: mcpData.fallback === true,
        };
      }
    } catch (error) {
      console.warn(`MCP market data lookup failed for ${symbolName}; using fallback values.`, error?.message || error);
      logProvider("snapshot", "fallback", `symbol=${symbolName} reason=mcp-error`);
      return buildFallbackSnapshot(symbolName);
    }

    logProvider("snapshot", "fallback", `symbol=${symbolName} reason=mcp-empty`);
    return buildFallbackSnapshot(symbolName);
  }

  if (!FINNHUB_API_KEY) {
    logProvider("snapshot", "fallback", `symbol=${symbolName} reason=missing-finnhub-key`);
    return buildFallbackSnapshot(symbolName);
  }

  logProvider("snapshot", "finnhub-api", `symbol=${symbolName}`);
  const client = createFinnhubClient();

  try {
    const [quoteResult, profileResult, candlesResult] = await Promise.allSettled([
      new Promise((resolve, reject) => {
        client.quote(symbolName, (error, data) => {
          if (error) reject(error);
          else resolve(data || {});
        });
      }),
      new Promise((resolve, reject) => {
        client.companyProfile2({ symbol: symbolName }, (error, data) => {
          if (error) reject(error);
          else resolve(data || {});
        });
      }),
      new Promise((resolve, reject) => {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 30 * 24 * 60 * 60;
        client.stockCandles(symbolName, "D", from, now, (error, data) => {
          if (error) reject(error);
          else resolve(data || {});
        });
      }),
    ]);

    if (quoteResult.status !== "fulfilled") {
      throw quoteResult.reason;
    }

    if (profileResult.status !== "fulfilled") {
      throw profileResult.reason;
    }

    const quoteData = quoteResult.value;
    const profileData = profileResult.value;
    const candlesData = candlesResult.status === "fulfilled" ? candlesResult.value : null;

    if (candlesResult.status === "rejected") {
      const reason = candlesResult.reason?.error || candlesResult.reason?.message || candlesResult.reason;
      console.warn(`Finnhub candles unavailable for ${symbolName}; continuing without chart data.`, reason);
    }

    return {
      symbol: symbolName,
      name: profileData.name || symbolName,
      price: quoteData.c ?? null,
      previousClose: quoteData.pc ?? null,
      change: quoteData.d ?? null,
      changePercent: quoteData.dp ?? null,
      dayHigh: quoteData.h ?? null,
      dayLow: quoteData.l ?? null,
      open: quoteData.o ?? null,
      marketCap: typeof profileData.marketCapitalization === "number"
        ? profileData.marketCapitalization * 1000000
        : null,
      currency: profileData.currency || "USD",
      peRatio: null,
      dividendYield: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      isMarketOpen: true,
      chartPoints: buildChartPoints(candlesData).slice(-30),
      fallback: false,
    };
  } catch (error) {
    console.warn(`Finnhub lookup failed for ${symbolName}; using fallback values.`, error.message || error);
    logProvider("snapshot", "fallback", `symbol=${symbolName} reason=finnhub-error`);
    return buildFallbackSnapshot(symbolName);
  }
}

export async function searchSymbols(query) {
  const text = String(query || "").trim().toUpperCase();

  if (!text) {
    return [];
  }

  if (MARKET_DATA_PROVIDER === "mcp") {
    logProvider("symbol-search", "mcp", `query=${text}`);
    try {
      return await searchSymbolsFromMcp(text);
    } catch (error) {
      console.warn(`MCP symbol search failed for query ${text}.`, error?.message || error);
      logProvider("symbol-search", "fallback", `query=${text} reason=mcp-error`);
      return [];
    }
  }

  if (!FINNHUB_API_KEY) {
    logProvider("symbol-search", "fallback", `query=${text} reason=missing-finnhub-key`);
    return [];
  }

  logProvider("symbol-search", "finnhub-api", `query=${text}`);
  const client = createFinnhubClient();

  try {
    const data = await new Promise((resolve, reject) => {
      client.symbolSearch(text, (error, result) => {
        if (error) reject(error);
        else resolve(result || {});
      });
    });

    const items = Array.isArray(data.result) ? data.result : [];
    return items.slice(0, 10).map((item) => ({
      symbol: item.symbol || "",
      description: item.description || "",
      type: item.type || "",
      displaySymbol: item.displaySymbol || item.symbol || "",
    }));
  } catch (error) {
    console.warn(`Finnhub symbol search failed for query ${text}.`, error?.message || error);
    logProvider("symbol-search", "fallback", `query=${text} reason=finnhub-error`);
    return [];
  }
}

export async function resolveSymbolForQuestion({ symbolHint, question }) {
  const normalizedHint = String(symbolHint || "").trim().toUpperCase();

  if (looksLikeTicker(normalizedHint)) {
    return {
      symbol: normalizedHint,
      source: "explicit-or-inferred",
      matches: [],
    };
  }

  const query = buildSearchQuery(symbolHint, question);
  if (!query) {
    return {
      symbol: DEFAULT_SYMBOL,
      source: "default",
      matches: [],
    };
  }

  const matches = await searchSymbols(query);
  const firstPlainTicker = matches.find((item) => !(item.symbol || "").includes(".")) || null;
  const bestMatch = matches.find((item) => looksLikeTicker(item.symbol)) || firstPlainTicker;

  if (bestMatch?.symbol) {
    return {
      symbol: bestMatch.symbol.toUpperCase(),
      source: MARKET_DATA_PROVIDER === "mcp" ? "mcp-symbol-search" : "finnhub-symbol-search",
      matches,
    };
  }

  return {
    symbol: DEFAULT_SYMBOL,
    source: "default",
    matches,
  };
}
