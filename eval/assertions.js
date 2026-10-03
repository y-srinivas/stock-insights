function toNumberTokensFromValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return [];
  }

  const fixed2 = Number(value).toFixed(2);
  const compact = Number(value).toString();
  return Array.from(new Set([compact, fixed2, `${Number(value)}`]));
}

function extractNumericTokens(text) {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  return matches || [];
}

function collectAllowedNumericTokens(snapshot) {
  const fields = [
    snapshot.price,
    snapshot.previousClose,
    snapshot.change,
    snapshot.changePercent,
    snapshot.dayHigh,
    snapshot.dayLow,
    snapshot.open,
  ];

  const tokens = fields.flatMap((value) => toNumberTokensFromValue(value));
  return new Set(tokens);
}

function isInsideKeyFigures(answer, tokenIndex) {
  const keyIndex = answer.indexOf("Key figures for ");
  if (keyIndex < 0) {
    return false;
  }

  const remainder = answer.slice(keyIndex);
  const keyBlock = remainder.split("\n\n")[0];
  const keyEnd = keyIndex + keyBlock.length;
  return tokenIndex >= keyIndex && tokenIndex <= keyEnd;
}

function findUngroundedTokens(answer, snapshot) {
  const allowed = collectAllowedNumericTokens(snapshot);
  const matches = Array.from(answer.matchAll(/-?\d+(?:\.\d+)?/g));
  const ungrounded = [];

  for (const match of matches) {
    const token = match[0];
    const index = match.index ?? -1;

    if (isInsideKeyFigures(answer, index)) {
      continue;
    }

    if (!allowed.has(token)) {
      ungrounded.push(token);
    }
  }

  return ungrounded;
}

export function runAssertions({ scenario, workflowResult }) {
  const failures = [];
  const answer = String(workflowResult.finalAnswer || "");
  const expectations = scenario.expectations || {};

  if (expectations.requireKeyFigures && !answer.includes(`Key figures for ${scenario.input.symbol}:`)) {
    failures.push("Missing deterministic key figures block.");
  }

  for (const value of expectations.mustInclude || []) {
    if (!answer.includes(value)) {
      failures.push(`Expected answer to include: ${value}`);
    }
  }

  for (const value of expectations.mustNotInclude || []) {
    if (answer.includes(value)) {
      failures.push(`Expected answer to exclude: ${value}`);
    }
  }

  if (expectations.expectFallbackSnapshot && workflowResult.marketData?.fallback !== true) {
    failures.push("Expected fallback snapshot to be used.");
  }

  if (expectations.requireGroundedNumbers) {
    const ungrounded = findUngroundedTokens(answer, workflowResult.marketData || {});
    if (ungrounded.length > 0) {
      failures.push(`Found ungrounded numeric claims: ${ungrounded.join(", ")}`);
    }
  }

  const extractedNumbers = extractNumericTokens(answer);

  return {
    passed: failures.length === 0,
    failures,
    stats: {
      answerLength: answer.length,
      numericTokenCount: extractedNumbers.length,
      hasFallbackSnapshot: workflowResult.marketData?.fallback === true,
    },
  };
}
