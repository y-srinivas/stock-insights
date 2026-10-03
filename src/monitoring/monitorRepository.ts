import {
  DEFAULT_DIP_THRESHOLD_PERCENT,
  MONITOR_NOTIFICATION_EMAIL,
  MONITOR_POLL_INTERVAL_MINUTES,
  MONITOR_SCHEDULER_ENABLED,
  MONITOR_TIMEZONE,
  MONITOR_WINDOW_END,
  MONITOR_WINDOW_START,
} from "../config.js";
import type { MonitorRepository } from "./repositoryTypes.ts";
import type { MonitorStoreData } from "./monitorTypes.ts";

export function buildDefaultMonitorState(): MonitorStoreData {
  return {
    settings: {
      pollIntervalMinutes: Number.isFinite(MONITOR_POLL_INTERVAL_MINUTES) && MONITOR_POLL_INTERVAL_MINUTES > 0
        ? MONITOR_POLL_INTERVAL_MINUTES
        : 120,
      timezone: MONITOR_TIMEZONE || "America/New_York",
      marketWindowStart: MONITOR_WINDOW_START || "09:30",
      marketWindowEnd: MONITOR_WINDOW_END || "16:30",
      schedulerEnabled: MONITOR_SCHEDULER_ENABLED,
      notificationEmail: MONITOR_NOTIFICATION_EMAIL,
    },
    digest: {
      lastSentDate: null,
      lastSentAt: null,
    },
    monitors: [],
    alerts: [],
    observations: [],
  };
}

export function normalizeThreshold(value: number | undefined): number {
  const candidate = Number(value ?? DEFAULT_DIP_THRESHOLD_PERCENT);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_DIP_THRESHOLD_PERCENT;
  }
  return candidate;
}

export type { MonitorRepository };