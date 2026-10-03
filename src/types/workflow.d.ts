import type { MarketDataSnapshot, SymbolResolution, SymbolSearchResult } from "./marketData.d.ts";

export interface LlmInvokeMessage {
  content?: unknown;
}

export interface LlmInvokeResponse {
  content: unknown;
}

export type ModelInvoker = (messages: LlmInvokeMessage[]) => Promise<LlmInvokeResponse | null>;

export interface StockWorkflowState {
  question: string;
  symbol: string;
  symbolMatches: SymbolSearchResult[];
  symbolResolutionSource: string;
  marketData: MarketDataSnapshot;
  research: string;
  risk: string;
  finalAnswer: string;
}

export interface WorkflowAgents {
  researchAgent: (state: StockWorkflowState) => Promise<StockWorkflowState>;
  riskAgent: (state: StockWorkflowState) => Promise<StockWorkflowState>;
  summaryAgent: (state: StockWorkflowState) => Promise<StockWorkflowState>;
}

export interface CreateStockAgentsOptions {
  modelInvoker?: ModelInvoker;
}

export interface RunStockWorkflowOptions {
  question?: string;
  getSnapshot?: (symbol: string) => Promise<MarketDataSnapshot>;
  resolveSymbol?: (args: { symbolHint: string; question: string }) => Promise<SymbolResolution>;
  agents?: WorkflowAgents;
}
