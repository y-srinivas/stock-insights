import { END, START, StateGraph, Annotation } from "@langchain/langgraph";

import { getStockSnapshot, resolveSymbolForQuestion } from "../lib/marketData.js";
import { researchAgent, riskAgent, summaryAgent } from "../agents/stockAgents.js";

const State = Annotation.Root({
  question: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "",
  }),
  symbol: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "",
  }),
  symbolMatches: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),
  symbolResolutionSource: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "default",
  }),
  marketData: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => ({}),
  }),
  research: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "",
  }),
  risk: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "",
  }),
  finalAnswer: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => "",
  }),
});

export function createStockWorkflow(options = {}) {
  const snapshotFetcher = options.getSnapshot || getStockSnapshot;
  const symbolResolver = options.resolveSymbol || resolveSymbolForQuestion;
  const agents = options.agents || { researchAgent, riskAgent, summaryAgent };

  return new StateGraph(State)
    .addNode("resolveSymbol", async (state) => {
      const resolution = await symbolResolver({
        symbolHint: state.symbol,
        question: state.question,
      });

      return {
        ...state,
        symbol: resolution.symbol,
        symbolMatches: resolution.matches || [],
        symbolResolutionSource: resolution.source || "default",
      };
    })
    .addNode("fetchMarketData", async (state) => {
      const marketData = await snapshotFetcher(state.symbol);
      return { ...state, marketData };
    })
    .addNode("researchNode", async (state) => agents.researchAgent(state))
    .addNode("riskNode", async (state) => agents.riskAgent(state))
    .addNode("summaryNode", async (state) => agents.summaryAgent(state))
    .addEdge(START, "resolveSymbol")
    .addEdge("resolveSymbol", "fetchMarketData")
    .addEdge("fetchMarketData", "researchNode")
    .addEdge("researchNode", "riskNode")
    .addEdge("riskNode", "summaryNode")
    .addEdge("summaryNode", END);
}

export async function runStockWorkflow(symbol, options = {}) {
  const app = createStockWorkflow(options).compile();
  return app.invoke({ symbol, question: options.question || "" });
}
