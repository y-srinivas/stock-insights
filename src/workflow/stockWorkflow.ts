import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import type { RunStockWorkflowOptions, StockWorkflowState, WorkflowAgents } from "../types/workflow.d.ts";

import { getStockSnapshot, resolveSymbolForQuestion } from "../lib/marketData.js";
import { researchAgent, riskAgent, summaryAgent } from "../agents/stockAgents.js";

function asWorkflowState(state: unknown): StockWorkflowState {
  return state as StockWorkflowState;
}

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

export function createStockWorkflow(options: RunStockWorkflowOptions = {}) {
  const snapshotFetcher = options.getSnapshot || getStockSnapshot;
  const symbolResolver = options.resolveSymbol || resolveSymbolForQuestion;
  const agents: WorkflowAgents = options.agents || { researchAgent, riskAgent, summaryAgent };

  return new StateGraph(State)
    .addNode("resolveSymbol", async (state) => {
      const typedState = asWorkflowState(state);
      const resolution = await symbolResolver({
        symbolHint: typedState.symbol,
        question: typedState.question,
      });

      return {
        ...typedState,
        symbol: resolution.symbol,
        symbolMatches: resolution.matches || [],
        symbolResolutionSource: resolution.source || "default",
      };
    })
    .addNode("fetchMarketData", async (state) => {
      const typedState = asWorkflowState(state);
      const marketData = await snapshotFetcher(typedState.symbol);
      return { ...typedState, marketData };
    })
    .addNode("researchNode", async (state) => agents.researchAgent(asWorkflowState(state)))
    .addNode("riskNode", async (state) => agents.riskAgent(asWorkflowState(state)))
    .addNode("summaryNode", async (state) => agents.summaryAgent(asWorkflowState(state)))
    .addEdge(START, "resolveSymbol")
    .addEdge("resolveSymbol", "fetchMarketData")
    .addEdge("fetchMarketData", "researchNode")
    .addEdge("researchNode", "riskNode")
    .addEdge("riskNode", "summaryNode")
    .addEdge("summaryNode", END);
}

export async function runStockWorkflow(symbol: string, options: RunStockWorkflowOptions = {}): Promise<StockWorkflowState> {
  const app = createStockWorkflow(options).compile();
  return (await app.invoke({ symbol, question: options.question || "" })) as StockWorkflowState;
}
