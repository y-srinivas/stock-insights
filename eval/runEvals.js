import fs from "node:fs";
import path from "node:path";

import { createStockAgents } from "../src/agents/stockAgents.js";
import { runStockWorkflow } from "../src/workflow/stockWorkflow.js";
import { runAssertions } from "./assertions.js";
import { scenarios } from "./scenarios.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
  const scenarioId = scenarioArg ? scenarioArg.split("=")[1] : null;
  return { scenarioId };
}

function createModelInvoker(llmPlan) {
  if (!llmPlan || !Array.isArray(llmPlan.calls)) {
    return null;
  }

  let callIndex = 0;
  return async () => {
    const call = llmPlan.calls[callIndex] || { type: "failure", error: "No planned LLM call" };
    callIndex += 1;

    if (call.type === "failure") {
      throw new Error(call.error || "Injected LLM failure");
    }

    return { content: call.content || "" };
  };
}

function selectScenarios(allScenarios, scenarioId) {
  if (!scenarioId) {
    return allScenarios;
  }

  return allScenarios.filter((scenario) => scenario.id === scenarioId);
}

function normalizeExpectedOutcome(assertionResult, scenario) {
  const expectFailure = Boolean(scenario.expectations?.expectFailure);
  const actualPass = assertionResult.passed;

  if (expectFailure) {
    return {
      passed: !actualPass,
      expected: "failure",
      actual: actualPass ? "pass" : "failure",
    };
  }

  return {
    passed: actualPass,
    expected: "pass",
    actual: actualPass ? "pass" : "failure",
  };
}

function ensureReportsDir() {
  const reportDir = path.join(process.cwd(), "eval", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  return reportDir;
}

function printSummary(results) {
  const rows = results.map((result) => ({
    scenario: result.id,
    expected: result.outcome.expected,
    actual: result.outcome.actual,
    status: result.outcome.passed ? "PASS" : "FAIL",
  }));

  console.table(rows);
}

async function runScenario(scenario) {
  const modelInvoker = createModelInvoker(scenario.llmPlan);
  const agents = createStockAgents({ modelInvoker });

  const workflowResult = await runStockWorkflow(scenario.input.symbol, {
    getSnapshot: async () => scenario.snapshot,
    agents,
  });

  const assertionResult = runAssertions({ scenario, workflowResult });
  const outcome = normalizeExpectedOutcome(assertionResult, scenario);

  return {
    id: scenario.id,
    description: scenario.description,
    input: scenario.input,
    workflowResult,
    assertions: assertionResult,
    outcome,
  };
}

async function main() {
  const { scenarioId } = parseArgs();
  const activeScenarios = selectScenarios(scenarios, scenarioId);

  if (activeScenarios.length === 0) {
    console.error(`No scenarios found for selector: ${scenarioId}`);
    process.exit(1);
  }

  const results = [];

  for (const scenario of activeScenarios) {
    const result = await runScenario(scenario);
    results.push(result);
  }

  printSummary(results);

  const reportDir = ensureReportsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `eval-report-${timestamp}.json`);
  const latestPath = path.join(reportDir, "latest.json");

  const aggregate = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((item) => item.outcome.passed).length,
    failed: results.filter((item) => !item.outcome.passed).length,
    results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(aggregate, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(aggregate, null, 2));

  const failed = aggregate.failed;
  if (failed > 0) {
    console.error(`Eval suite failed: ${failed} scenario(s) failed.`);
    console.error(`Report written to ${reportPath}`);
    process.exit(1);
  }

  console.log(`Eval suite passed: ${aggregate.passed}/${aggregate.total}`);
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error("Eval runner failed:", error);
  process.exit(1);
});
