# Stock Insights: Deterministic LangGraph Design and Integration Roadmap

## 1. Purpose

This document explains how the current stock-insights workflow uses LangGraph to keep behavior predictable, where hallucination risk still exists, and how to evolve the app with stronger data quality and richer market intelligence.

Primary goals:

1. Keep outputs grounded in trusted external data.
2. Make workflow execution deterministic and debuggable.
3. Minimize LLM hallucination in final user responses.
4. Define practical API and product enhancements.

## 2. Current Architecture

The system is organized as a fixed LangGraph pipeline with four nodes:

1. fetchMarketData
2. researchNode
3. riskNode
4. summaryNode

Execution order is fixed and acyclic:

START -> fetchMarketData -> researchNode -> riskNode -> summaryNode -> END

Core files:

- src/workflow/stockWorkflow.js
- src/lib/marketData.js
- src/agents/stockAgents.js
- src/server.js

## 3. State Contract and Data Lineage

The LangGraph state has these top-level fields:

1. symbol
2. marketData
3. research
4. risk
5. finalAnswer

Data lineage:

1. symbol is resolved from chat request and passed to workflow.
2. fetchMarketData writes marketData from Finnhub (or fallback dataset).
3. researchNode reads marketData and writes research text.
4. riskNode reads marketData and writes risk text.
5. summaryNode combines marketData + research + risk into finalAnswer.

This flow guarantees that every final answer is produced from the same immutable market snapshot collected at the start of the run.

## 4. Why LangGraph is Deterministic Here

The workflow is deterministic at the orchestration layer for these reasons:

1. Fixed node sequence with explicit edges.
2. No conditional branches that can skip or reorder nodes.
3. No parallel fan-out/fan-in race conditions.
4. Explicit state reducers that deterministically apply updates.
5. Single invoke entrypoint in runStockWorkflow.

Given the same input symbol and identical upstream API responses, graph-level output evolution is reproducible.

## 5. Hallucination Control Strategy (Current)

The app currently reduces hallucination through structural controls:

### 5.1 Grounding by construction

- All analysis nodes are fed a concrete marketData object, not raw user speculation.
- summaryNode now prepends a deterministic Key figures block from marketData.

### 5.2 Provider failure fallback

- If LLM fails (quota, model not found, provider outage), each analysis node falls back to rule-based deterministic text.
- User still receives stable output instead of runtime failure.

### 5.3 Partial API failure tolerance

- Finnhub quote and companyProfile2 are treated as required.
- stockCandles is treated as optional.
- If candles fail due plan limits, quote/profile still produce live key figures.

### 5.4 Symbol resolution hardening

- The app resolves ticker from user message and avoids stale symbol carryover.

## 6. Limits of Determinism and Hallucination Risk

Deterministic orchestration is not equal to deterministic language output.

Remaining risk areas:

1. LLM narrative can still infer unsupported claims unless constrained.
2. Provider/model changes alter wording and recommendation style.
3. Prompt ambiguity may produce inconsistent tone and recommendation strength.
4. Missing data fields can still invite speculative language.

Current mitigation level: medium.

## 7. Recommended Hardening for Near-Zero Hallucination

To make outputs almost fully factual and machine-verifiable, implement these controls:

1. Schema-constrained output (JSON mode) for research/risk/summary.
2. Evidence tags per claim, referencing marketData fields.
3. Claim validator that rejects any statement not backed by known fields.
4. Confidence score derived from data completeness, not model confidence text.
5. Forbidden-claim policy for unavailable metrics.

Suggested summary schema:

- symbol
- keyFigures
- trendAssessment
- riskAssessment
- recommendation
- unsupportedClaims (must be empty)

Validation rule example:

Any numeric claim in final answer must map to one of:

- marketData.price
- marketData.dayHigh
- marketData.dayLow
- marketData.open
- marketData.previousClose
- marketData.change
- marketData.changePercent
- marketData.marketCap

If not mapped, strip or rewrite claim.

## 8. API Integration Roadmap

### 8.1 Priority 1: Market data quality and depth

1. Polygon or Twelve Data for intraday OHLCV fallback when Finnhub candles blocked.
2. Alpha Vantage as low-cost backup feed.
3. Exchange-calendar API to properly set isMarketOpen and session context.

Benefits:

- Reduces missing data.
- Improves chart-based prompts.
- Improves time-aware recommendations.

### 8.2 Priority 2: Fundamental and estimates data

1. Financial Modeling Prep for income statement, balance sheet, cash flow.
2. SEC EDGAR structured filings parser for 10-K/10-Q deltas.
3. Analyst estimate endpoints (EPS revisions, target dispersion).

Benefits:

- Better valuation analysis.
- Fewer generic recommendations.
- Explainable thesis from fundamentals.

### 8.3 Priority 3: News and event intelligence

1. Benzinga or Finnhub news sentiment endpoints.
2. Earnings calendar API.
3. Insider transactions and institutional ownership feeds.

Benefits:

- Event-aware risk scoring.
- Better near-term volatility warnings.

### 8.4 Priority 4: Derivatives and macro context

1. Options chain API for implied volatility and put-call skew.
2. Macro data API (FRED) for rates and inflation regime.
3. Sector ETF-relative strength feed.

Benefits:

- Better risk and positioning context.
- Better regime-aware recommendations.

## 9. Product and Agent Enhancements

### 9.1 Multi-agent specialization

Split current analysis into strict specialist agents:

1. MarketStructureAgent: trend and volatility from OHLCV.
2. FundamentalAgent: valuation and earnings quality.
3. EventRiskAgent: catalysts, calendar, and news shocks.
4. PortfolioFitAgent: position sizing and downside limits.

Then add a deterministic AggregatorAgent that only merges validated specialist outputs.

### 9.2 Decision trace in API response

Add metadata fields:

1. llmSource: ollama, openai, github-models, fallback
2. marketDataSource: finnhub-live, finnhub-partial, synthetic-fallback
3. dataFreshnessSeconds
4. validationPassed: true or false

This makes debugging and trust audits straightforward.

### 9.3 Explainability and UX

1. Show a collapsible Raw Data section in UI.
2. Show unsupported fields explicitly as unavailable.
3. Show a data quality badge (high, medium, low).

## 10. Testing Strategy for Deterministic Behavior

### 10.1 Unit tests

1. marketData transformation tests (quote/profile/candles parsing).
2. fallback path tests per error type.
3. symbol extraction precedence tests.

### 10.2 Integration tests

1. Mocked Finnhub responses for full, partial, and denied access.
2. Provider matrix tests: openai, github-models, ollama, llm-fallback.

### 10.3 Regression tests

1. Snapshot tests for Key figures block.
2. Assertion that final answer always contains key figure lines.
3. Assertion that numeric claims map to allowed fields after validator.

## 11. Security and Operational Notes

1. Keep secrets only in .env, never .env.example.
2. Rotate leaked keys immediately.
3. Add request timeout and retry budgets per provider.
4. Add structured logs with requestId for cross-node tracing.

## 12. Suggested Next Implementation Steps

1. Add response metadata fields: llmSource and marketDataSource.
2. Add JSON schema output mode for summary node.
3. Add claim validator to block unsupported numeric claims.
4. Add second market data provider for candle fallback.
5. Add automated tests for partial Finnhub access behavior.

## 13. Definition of Done for Hallucination-Resistant v2

The workflow can be considered hallucination-resistant when all are true:

1. Every numeric claim in final answer is validator-backed.
2. Unsupported fields are explicitly marked unavailable.
3. API response includes source metadata and freshness.
4. Integration tests pass for full and partial market data paths.
5. Deterministic key-figures section is always present.
