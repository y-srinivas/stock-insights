import dotenv from "dotenv";

dotenv.config();

export const MODEL_PROVIDER = (process.env.MODEL_PROVIDER || "openai").toLowerCase();
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const GITHUB_MODELS_BASE_URL = process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference";
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
export const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "ollama";
export const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
export const MARKET_DATA_PROVIDER = (process.env.MARKET_DATA_PROVIDER || "finnhub").toLowerCase();
export const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "";
export const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";
export const MCP_TOOL_STOCK_SNAPSHOT = process.env.MCP_TOOL_STOCK_SNAPSHOT || "get_stock_snapshot";
export const MCP_TOOL_SYMBOL_SEARCH = process.env.MCP_TOOL_SYMBOL_SEARCH || "search_symbols";
export const MCP_REQUEST_TIMEOUT_MS = Number(process.env.MCP_REQUEST_TIMEOUT_MS || 8000);
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
export const DEFAULT_SYMBOL = process.env.DEFAULT_SYMBOL || "AAPL";
