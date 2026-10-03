# Stock Insights Multi-Agent Workflow

This project is a Node.js stock analysis assistant built with LangGraph. It uses a small multi-agent workflow to:

1. Fetch market data for a ticker
2. Analyze the stock with a research agent
3. Review risk with a risk agent
4. Combine both into a final trading summary

## Tech stack

- Node.js
- LangGraph
- LangChain OpenAI integration
- Finnhub market data via the official `finnhub` SDK

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Add your API keys in `.env`:
   - `OPENAI_API_KEY` when using the default OpenAI provider
   - `GITHUB_TOKEN` when using GitHub Models
  - `OLLAMA_BASE_URL` when using a local Ollama server (default `http://localhost:11434/v1`)
   - `FINNHUB_API_KEY` for live market data from Finnhub
4. Choose the provider in `.env`:
   ```env
  MODEL_PROVIDER=ollama
  LLM_MODEL=llama3.1:8b
   ```

### Provider examples

Use OpenAI:

```env
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
LLM_MODEL=gpt-4o-mini
```

Use GitHub Models:

```env
MODEL_PROVIDER=github-models
GITHUB_TOKEN=your_github_models_token_here
GITHUB_MODELS_BASE_URL=https://models.github.ai/inference
LLM_MODEL=openai/gpt-4o-mini
```

Use local Ollama:

```env
MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_API_KEY=ollama
LLM_MODEL=llama3.1:8b
```

## Run the app

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

You can also run the CLI version directly:

```bash
npm run cli -- AAPL
```

## Workflow design

- `fetchMarketData`: retrieves the latest quote and recent price history
- `research`: researches the trend and valuation story
- `risk`: checks downside risk and volatility concerns
- `summary`: combines all information into a final answer

## Optional LLM mode

If `OPENAI_API_KEY` is set, the agents call OpenAI to produce richer analysis. If not, the project falls back to deterministic heuristics so the workflow still runs offline.

## Market data provider switch (Finnhub or MCP)

Market data can be sourced from either direct Finnhub API calls or an MCP server.

Use Finnhub (default):

```env
MARKET_DATA_PROVIDER=finnhub
FINNHUB_API_KEY=your_finnhub_api_key_here
```

Use MCP server:

```env
MARKET_DATA_PROVIDER=mcp
MCP_SERVER_URL=http://localhost:3001/mcp
MCP_AUTH_TOKEN=
MCP_TOOL_STOCK_SNAPSHOT=get_stock_snapshot
MCP_TOOL_SYMBOL_SEARCH=search_symbols
MCP_REQUEST_TIMEOUT_MS=8000
```

Expected MCP tool outputs:

1. `get_stock_snapshot`: object with fields such as `symbol`, `price`, `dayHigh`, `dayLow`, `previousClose`, `change`, `changePercent`, `marketCap`, and optional `chartPoints`.
2. `search_symbols`: array-like result in `matches`, `result`, or `symbols`, where each item includes at least `symbol` or `ticker`.

## Eval framework for complex scenarios

The repository includes a deterministic eval harness under `eval/` to test complex graph behaviors with mocked market snapshots and controllable LLM outcomes.

Run the full suite:

```bash
npm run eval
```

Run one scenario:

```bash
npm run eval:scenario -- --scenario=full-data-llm-success
```

What this validates:

1. Deterministic key-figures block is always present.
2. Numeric claims can be checked against the snapshot fields.
3. LLM failure paths still produce a stable final answer.
4. Fallback snapshot behavior can be asserted explicitly.

Generated reports:

1. `eval/reports/latest.json`
2. Timestamped reports in `eval/reports/`

## Project structure

```text
src/
  agents/
    stockAgents.js
  lib/
    marketData.js
  workflow/
    stockWorkflow.js
  config.js
  index.js
```

## Deep-dive documentation

- [Deterministic LangGraph Design and Integration Roadmap](docs/DETERMINISTIC_LANGGRAPH_AND_INTEGRATION_ROADMAP.md)
- [Technical App Flow and Architecture](docs/TECHNICAL_APP_FLOW_AND_ARCHITECTURE.md)
