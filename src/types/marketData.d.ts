export type MarketDataProvider = "finnhub" | "mcp";

export interface ChartPoint {
  timestamp: number;
  close: number | null;
}

export interface MarketDataSnapshot {
  symbol: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  marketCap: number | null;
  currency: string;
  peRatio: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  isMarketOpen: boolean;
  chartPoints: ChartPoint[];
  fallback: boolean;
}

export interface SymbolSearchResult {
  symbol: string;
  description: string;
  type: string;
  displaySymbol: string;
}

export interface SymbolResolution {
  symbol: string;
  source: string;
  matches: SymbolSearchResult[];
}
