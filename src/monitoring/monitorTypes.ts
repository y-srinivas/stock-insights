export type BaselineMode = "previous-close";

export type AlertState = "clear" | "triggered";

export interface MonitorSettings {
  pollIntervalMinutes: number;
  timezone: string;
  marketWindowStart: string;
  marketWindowEnd: string;
  schedulerEnabled: boolean;
  notificationEmail: string;
}

export interface MonitorDigestStatus {
  lastSentDate: string | null;
  lastSentAt: string | null;
}

export interface MonitorEntry {
  symbol: string;
  displayName: string;
  enabled: boolean;
  dipThresholdPercent: number;
  baselineMode: BaselineMode;
  baselinePrice: number | null;
  lastObservedPrice: number | null;
  lastCheckedAt: string | null;
  lastAlertedAt: string | null;
  lastAlertedDipPercent: number | null;
  alertState: AlertState;
  createdAt: string;
  updatedAt: string;
}

export interface MonitorAlert {
  id: string;
  symbol: string;
  triggeredAt: string;
  latestPrice: number;
  baselinePrice: number;
  dipPercent: number;
  thresholdPercent: number;
  reason: string;
  observationId: string;
}

export interface MonitorObservation {
  id: string;
  symbol: string;
  observedAt: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  marketCap: number | null;
  isMarketOpen: boolean;
  fallback: boolean;
  source: string;
}

export interface MonitorStoreData {
  settings: MonitorSettings;
  digest: MonitorDigestStatus;
  monitors: MonitorEntry[];
  alerts: MonitorAlert[];
  observations: MonitorObservation[];
}

export interface CreateMonitorInput {
  symbol: string;
  dipThresholdPercent?: number;
  enabled?: boolean;
}

export interface UpdateMonitorInput {
  dipThresholdPercent?: number;
  enabled?: boolean;
}

export interface UpdateMonitorSettingsInput {
  pollIntervalMinutes?: number;
  timezone?: string;
  marketWindowStart?: string;
  marketWindowEnd?: string;
  schedulerEnabled?: boolean;
  notificationEmail?: string;
}

export interface MonitorRunResult {
  runAt: string;
  processedSymbols: number;
  emittedAlerts: number;
  digestSent: boolean;
}

export interface DailyDigestPayload {
  recipientEmail: string;
  digestDate: string;
  alerts: MonitorAlert[];
}