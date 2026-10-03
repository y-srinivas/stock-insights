import type { BaselineMode } from "./monitorTypes.ts";
import type { MarketDataSnapshot } from "../types/marketData.d.ts";

export interface DipEvaluation {
  baselinePrice: number | null;
  latestPrice: number | null;
  dipPercent: number | null;
  thresholdCrossed: boolean;
}

function resolveBaselinePrice(snapshot: MarketDataSnapshot, baselineMode: BaselineMode): number | null {
  if (baselineMode === "previous-close") {
    return typeof snapshot.previousClose === "number" && snapshot.previousClose > 0 ? snapshot.previousClose : null;
  }

  return null;
}

export function evaluateDip(snapshot: MarketDataSnapshot, baselineMode: BaselineMode, thresholdPercent: number): DipEvaluation {
  const baselinePrice = resolveBaselinePrice(snapshot, baselineMode);
  const latestPrice = typeof snapshot.price === "number" ? snapshot.price : null;

  if (!baselinePrice || !latestPrice) {
    return {
      baselinePrice,
      latestPrice,
      dipPercent: null,
      thresholdCrossed: false,
    };
  }

  const dipPercent = Number((((baselinePrice - latestPrice) / baselinePrice) * 100).toFixed(2));
  return {
    baselinePrice,
    latestPrice,
    dipPercent,
    thresholdCrossed: dipPercent >= thresholdPercent,
  };
}