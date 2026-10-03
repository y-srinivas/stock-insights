import { DEFAULT_SYMBOL } from "./config.js";
import { runStockWorkflow } from "./workflow/stockWorkflow.js";

const symbol = process.argv[2] || DEFAULT_SYMBOL;

const result = await runStockWorkflow(symbol);

console.log(`\n=== Stock Insights: ${result.symbol || symbol} ===\n`);
console.log(result.finalAnswer || "No final insight generated.");
