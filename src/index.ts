import { DEFAULT_SYMBOL } from "./config.js";
import { runStockWorkflow } from "./workflow/stockWorkflow.ts";
import type { StockWorkflowState } from "./types/workflow.d.ts";

const symbol = process.argv[2] || DEFAULT_SYMBOL;

const result = (await runStockWorkflow(symbol)) as StockWorkflowState;

console.log(`\n=== Stock Insights: ${result.symbol || symbol} ===\n`);
console.log(result.finalAnswer || "No final insight generated.");
