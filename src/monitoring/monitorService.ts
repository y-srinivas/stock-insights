import { getStockSnapshot } from "../lib/marketData.ts";
import type { MarketDataSnapshot } from "../types/marketData.d.ts";
import { evaluateDip } from "./dipEvaluator.ts";
import { getLocalDateKey, isLastMonitorSlotOfDay } from "./marketWindow.ts";
import { normalizeThreshold } from "./monitorRepository.ts";
import type {
  CreateMonitorInput,
  DailyDigestPayload,
  MonitorAlert,
  MonitorEntry,
  MonitorObservation,
  MonitorRunResult,
  MonitorSettings,
  UpdateMonitorInput,
  UpdateMonitorSettingsInput,
} from "./monitorTypes.ts";
import type { MonitorNotifier } from "./notifier.ts";
import type { MonitorRepository } from "./repositoryTypes.ts";

function createId(prefix: string, symbol?: string): string {
  const normalizedSymbol = symbol ? `-${symbol}` : "";
  return `${prefix}${normalizedSymbol}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function applySettingsUpdate(current: MonitorSettings, update: UpdateMonitorSettingsInput): MonitorSettings {
  const nextSettings = { ...current };

  if (update.pollIntervalMinutes !== undefined) {
    const interval = Number(update.pollIntervalMinutes);
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error("pollIntervalMinutes must be a positive number.");
    }
    nextSettings.pollIntervalMinutes = interval;
  }

  if (update.timezone !== undefined) {
    nextSettings.timezone = String(update.timezone).trim() || current.timezone;
  }

  if (update.marketWindowStart !== undefined) {
    nextSettings.marketWindowStart = String(update.marketWindowStart).trim();
  }

  if (update.marketWindowEnd !== undefined) {
    nextSettings.marketWindowEnd = String(update.marketWindowEnd).trim();
  }

  if (update.schedulerEnabled !== undefined) {
    nextSettings.schedulerEnabled = Boolean(update.schedulerEnabled);
  }

  if (update.notificationEmail !== undefined) {
    nextSettings.notificationEmail = String(update.notificationEmail).trim();
  }

  return nextSettings;
}

export class MonitorService {
  #repository: MonitorRepository;
  #notifier: MonitorNotifier;
  #snapshotFetcher: (symbol: string) => Promise<MarketDataSnapshot>;

  constructor({
    repository,
    notifier,
    snapshotFetcher = getStockSnapshot,
  }: {
    repository: MonitorRepository;
    notifier: MonitorNotifier;
    snapshotFetcher?: (symbol: string) => Promise<MarketDataSnapshot>;
  }) {
    this.#repository = repository;
    this.#notifier = notifier;
    this.#snapshotFetcher = snapshotFetcher;
  }

  async listMonitors(): Promise<MonitorEntry[]> {
    const state = await this.#repository.getState();
    return clone(state.monitors);
  }

  async createMonitor(input: CreateMonitorInput): Promise<MonitorEntry> {
    const symbol = normalizeSymbol(input.symbol);
    if (!symbol) {
      throw new Error("symbol is required.");
    }

    const snapshot = await this.#snapshotFetcher(symbol);
    const now = new Date().toISOString();

    return this.#repository.mutate((state) => {
      const existing = state.monitors.find((entry) => entry.symbol === symbol);
      if (existing) {
        throw new Error(`Monitor already exists for ${symbol}.`);
      }

      const monitor: MonitorEntry = {
        symbol,
        displayName: snapshot.name || symbol,
        enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
        dipThresholdPercent: normalizeThreshold(input.dipThresholdPercent),
        baselineMode: "previous-close",
        baselinePrice: null,
        lastObservedPrice: null,
        lastCheckedAt: null,
        lastAlertedAt: null,
        lastAlertedDipPercent: null,
        alertState: "clear",
        createdAt: now,
        updatedAt: now,
      };

      state.monitors.push(monitor);
      return clone(monitor);
    });
  }

  async updateMonitor(symbol: string, update: UpdateMonitorInput): Promise<MonitorEntry> {
    const normalizedSymbol = normalizeSymbol(symbol);

    return this.#repository.mutate((state) => {
      const monitor = state.monitors.find((entry) => entry.symbol === normalizedSymbol);
      if (!monitor) {
        throw new Error(`Monitor not found for ${normalizedSymbol}.`);
      }

      if (update.dipThresholdPercent !== undefined) {
        monitor.dipThresholdPercent = normalizeThreshold(update.dipThresholdPercent);
      }

      if (update.enabled !== undefined) {
        monitor.enabled = Boolean(update.enabled);
      }

      monitor.updatedAt = new Date().toISOString();
      return clone(monitor);
    });
  }

  async deleteMonitor(symbol: string): Promise<boolean> {
    const normalizedSymbol = normalizeSymbol(symbol);

    return this.#repository.mutate((state) => {
      const initialLength = state.monitors.length;
      state.monitors = state.monitors.filter((entry) => entry.symbol !== normalizedSymbol);
      return state.monitors.length !== initialLength;
    });
  }

  async getSettings(): Promise<MonitorSettings> {
    const state = await this.#repository.getState();
    return clone(state.settings);
  }

  async getDigestStatus(): Promise<{ lastSentDate: string | null; lastSentAt: string | null }> {
    const state = await this.#repository.getState();
    return clone(state.digest);
  }

  async updateSettings(update: UpdateMonitorSettingsInput): Promise<MonitorSettings> {
    return this.#repository.mutate((state) => {
      state.settings = applySettingsUpdate(state.settings, update);
      return clone(state.settings);
    });
  }

  async listAlerts(limit = 50): Promise<MonitorAlert[]> {
    const state = await this.#repository.getState();
    return clone(state.alerts.slice(0, Math.max(1, limit)));
  }

  async listObservations({ symbol, limit = 100 }: { symbol?: string; limit?: number } = {}): Promise<MonitorObservation[]> {
    const state = await this.#repository.getState();
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : "";
    const observations = normalizedSymbol
      ? state.observations.filter((entry) => entry.symbol === normalizedSymbol)
      : state.observations;

    return clone(observations.slice(0, Math.max(1, limit)));
  }

  async runMonitorCycle(): Promise<MonitorRunResult> {
    const enabledMonitors = (await this.listMonitors()).filter((entry) => entry.enabled);
    const runDate = new Date();
    const runAt = runDate.toISOString();

    if (enabledMonitors.length === 0) {
      return {
        runAt,
        processedSymbols: 0,
        emittedAlerts: 0,
        digestSent: false,
      };
    }

    let digestPayload: DailyDigestPayload | null = null;
    let emittedAlerts = 0;

    await this.#repository.mutate(async (state) => {
      const digestDate = getLocalDateKey(runDate, state.settings.timezone);

      for (const monitor of state.monitors) {
        if (!monitor.enabled) {
          continue;
        }

        const snapshot = await this.#snapshotFetcher(monitor.symbol);
        const evaluation = evaluateDip(snapshot, monitor.baselineMode, monitor.dipThresholdPercent);
        const observation = this.#createObservation(snapshot);

        state.observations.unshift(observation);
        monitor.displayName = snapshot.name || monitor.displayName || monitor.symbol;
        monitor.baselinePrice = evaluation.baselinePrice;
        monitor.lastObservedPrice = evaluation.latestPrice;
        monitor.lastCheckedAt = observation.observedAt;
        monitor.updatedAt = observation.observedAt;

        if (evaluation.thresholdCrossed && evaluation.baselinePrice !== null && evaluation.latestPrice !== null && evaluation.dipPercent !== null) {
          if (monitor.alertState !== "triggered") {
            const alert = this.#createAlert(monitor, observation, evaluation.baselinePrice, evaluation.latestPrice, evaluation.dipPercent);
            state.alerts.unshift(alert);
            emittedAlerts += 1;
            monitor.alertState = "triggered";
            monitor.lastAlertedAt = alert.triggeredAt;
            monitor.lastAlertedDipPercent = alert.dipPercent;
          }
        } else {
          monitor.alertState = "clear";
        }
      }

      state.alerts = state.alerts.slice(0, 500);
      state.observations = state.observations.slice(0, 5000);

      const shouldSendDigest = Boolean(state.settings.notificationEmail)
        && state.digest.lastSentDate !== digestDate
        && isLastMonitorSlotOfDay(runDate, state.settings);

      if (shouldSendDigest) {
        const todaysAlerts = state.alerts
          .filter((alert) => getLocalDateKey(new Date(alert.triggeredAt), state.settings.timezone) === digestDate)
          .sort((left, right) => left.symbol.localeCompare(right.symbol));

        if (todaysAlerts.length > 0) {
          digestPayload = {
            recipientEmail: state.settings.notificationEmail,
            digestDate,
            alerts: clone(todaysAlerts),
          };
        }
      }
    });

    if (digestPayload) {
      await this.#notifier.notifyDailyDigest(digestPayload);
      await this.#repository.mutate((state) => {
        state.digest.lastSentDate = digestPayload?.digestDate || null;
        state.digest.lastSentAt = runAt;
      });
    }

    return {
      runAt,
      processedSymbols: enabledMonitors.length,
      emittedAlerts,
      digestSent: Boolean(digestPayload),
    };
  }

  #createObservation(snapshot: MarketDataSnapshot): MonitorObservation {
    return {
      id: createId("obs", snapshot.symbol),
      symbol: snapshot.symbol,
      observedAt: new Date().toISOString(),
      price: snapshot.price,
      previousClose: snapshot.previousClose,
      change: snapshot.change,
      changePercent: snapshot.changePercent,
      dayHigh: snapshot.dayHigh,
      dayLow: snapshot.dayLow,
      open: snapshot.open,
      marketCap: snapshot.marketCap,
      isMarketOpen: snapshot.isMarketOpen,
      fallback: snapshot.fallback,
      source: snapshot.fallback ? "fallback" : "live",
    };
  }

  #createAlert(
    monitor: MonitorEntry,
    observation: MonitorObservation,
    baselinePrice: number,
    latestPrice: number,
    dipPercent: number,
  ): MonitorAlert {
    return {
      id: createId("alert", monitor.symbol),
      symbol: monitor.symbol,
      triggeredAt: observation.observedAt,
      latestPrice,
      baselinePrice,
      dipPercent,
      thresholdPercent: monitor.dipThresholdPercent,
      reason: `${monitor.symbol} dipped ${dipPercent.toFixed(2)}% from previous close.`,
      observationId: observation.id,
    };
  }
}