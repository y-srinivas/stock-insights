# Stock Insights: Technical App Flow and Architecture

## 1. Overview

This document explains how the application works end-to-end at runtime, including request flow, module boundaries, state transitions, data provider behavior, and fault handling.

The app is a Node.js service that combines:

1. Express for HTTP and static UI hosting.
2. LangGraph for deterministic orchestration.
3. LangChain chat models for analysis generation.
4. Finnhub as the market data provider (with graceful degradation).

## 2. Runtime Entry Points

The repository has two runnable entry points:

1. `src/server.js`
- Main web server for browser chat UI and API endpoints.
- Serves static assets from `public/`.
- Exposes `POST /api/chat`.

2. `src/index.js`
- CLI entry for one-shot workflow execution.
- Useful for quick terminal testing.

## 3. Request Lifecycle (Web)

A user chat request follows this path:

1. Browser submits message + symbol via `public/app.js`.
2. `POST /api/chat` in `src/server.js` receives payload.
3. Server resolves final symbol using precedence:
- ticker inferred from message text
- explicit symbol field
- default symbol from env
4. Server invokes `runStockWorkflow(symbol)` in `src/workflow/stockWorkflow.js`.
5. Workflow executes deterministic node pipeline:
- `fetchMarketData`
- `researchNode`
- `riskNode`
- `summaryNode`
6. API returns JSON containing:
- symbol
- question
- answer (final output)
- marketData
- research
- risk

## 4. Deterministic Workflow Design

`src/workflow/stockWorkflow.js` defines an acyclic fixed graph:

START -> fetchMarketData -> researchNode -> riskNode -> summaryNode -> END

State fields:

1. `symbol`
2. `marketData`
3. `research`
4. `risk`
5. `finalAnswer`

Key deterministic properties:

1. Fixed node order.
2. No branching or route ambiguity.
3. Explicit state updates between nodes.
4. Single workflow invocation per request.

## 5. Market Data Layer

`src/lib/marketData.js` fetches market data via Finnhub and normalizes it.

### 5.1 Required vs optional endpoints

Required endpoints:

1. `quote`
2. `companyProfile2`

Optional endpoint:

1. `stockCandles`

Reasoning:

- Some Finnhub plans can access quote/profile but not candles.
- The app now treats candles as optional so missing candle access does not break live pricing.

### 5.2 Normalized market snapshot fields

The module produces a consistent `marketData` shape:

1. symbol
2. name
3. price
4. previousClose
5. change
6. changePercent
7. dayHigh
8. dayLow
9. open
10. marketCap
11. currency
12. chartPoints
13. fallback

Important detail:

- `marketCapitalization` from Finnhub is in millions and is normalized to dollars in code.

### 5.3 Fallback behavior

The data layer has two fallback modes:

1. Full fallback (`fallback: true`):
- When key is missing or required endpoints fail.
- Returns synthetic deterministic snapshot.

2. Partial live mode (`fallback: false`):
- quote/profile succeed but candles fail.
- Returns real key figures and empty chart data.

## 6. Analysis Layer

`src/agents/stockAgents.js` implements three analysis stages:

1. `researchAgent`
2. `riskAgent`
3. `summaryAgent`

### 6.1 Provider selection

Model provider is selected through environment settings in `src/config.js`:

1. `openai`
2. `github-models`
3. `ollama`

Provider mapping:

- OpenAI: `OPENAI_API_KEY`
- GitHub Models: `GITHUB_TOKEN` + `GITHUB_MODELS_BASE_URL`
- Ollama: `OLLAMA_API_KEY` + `OLLAMA_BASE_URL`

### 6.2 LLM fault tolerance

Each stage handles LLM failures gracefully:

1. If LLM not configured: deterministic rule-based fallback text.
2. If model call fails: fallback text returned for that stage.

This prevents request crashes from quota issues or model outages.

### 6.3 Key figures enforcement

Final output is wrapped with a deterministic key-figures section sourced from `marketData`:

1. current price
2. day high
3. day low
4. open
5. previous close
6. change and change percent
7. market cap

This ensures critical numeric facts are visible even when LLM narrative is verbose.

## 7. UI Layer

`public/` contains the browser client:

1. `index.html`
2. `styles.css`
3. `app.js`

Behavior:

1. User selects or types ticker.
2. Message is submitted to `/api/chat`.
3. Chat history is rendered with user and assistant bubbles.
4. Suggested ticker chips update symbol input quickly.

## 8. Environment and Configuration

`src/config.js` centralizes environment values loaded via dotenv.

Common variables:

1. `MODEL_PROVIDER`
2. `LLM_MODEL`
3. `OPENAI_API_KEY`
4. `GITHUB_TOKEN`
5. `GITHUB_MODELS_BASE_URL`
6. `OLLAMA_BASE_URL`
7. `OLLAMA_API_KEY`
8. `FINNHUB_API_KEY`
9. `DEFAULT_SYMBOL`

## 9. API Contract

### 9.1 Health endpoint

`GET /api/health`

Response:

```json
{
  "status": "ok",
  "service": "stock-insights-agent"
}
```

### 9.2 Chat endpoint

`POST /api/chat`

Request example:

```json
{
  "symbol": "GOOG",
  "message": "Provide high and low for GOOG"
}
```

Response fields:

1. `symbol`
2. `question`
3. `answer`
4. `marketData`
5. `research`
6. `risk`

## 10. Error Handling Model

The app degrades in layers instead of hard-failing:

1. Model provider failure -> fallback text.
2. Finnhub candle permission failure -> continue with quote/profile.
3. Required data endpoint failure -> synthetic fallback snapshot.
4. Server-level exception -> 500 with error message.

## 11. Observability and Debugging

Current observability:

1. Console warnings for LLM failures.
2. Console warnings for Finnhub endpoint restrictions.
3. Final response always includes visible key figures.

Recommended future observability additions:

1. `llmSource` field in API response.
2. `marketDataSource` field in API response.
3. request IDs and structured logs.

## 12. Performance Notes

1. Current graph is sequential and simple, minimizing orchestration overhead.
2. Finnhub requests run concurrently where possible.
3. LLM calls are bounded by node count (three model calls max).
4. No persistent cache yet, so repeated ticker requests call providers again.

## 13. Security Notes

1. Keep secrets in `.env` only.
2. Never commit real keys to tracked files.
3. Rotate exposed keys immediately.
4. Use least-privilege tokens for external providers.

## 14. Known Constraints

1. Finnhub candle access may be plan-restricted.
2. Some model providers may vary in output style.
3. LLM narrative quality depends on chosen model and prompt behavior.

## 15. Suggested Next Technical Upgrades

1. Add response metadata: `llmSource`, `marketDataSource`, `dataFreshnessSeconds`.
2. Add output schema validation for summary responses.
3. Add multi-provider market data fallback for candles.
4. Add automated integration tests for provider permutations.
5. Add lightweight in-memory cache for quote/profile calls.
