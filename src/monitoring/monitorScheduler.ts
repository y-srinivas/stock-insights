import { findNextMonitorRun } from "./marketWindow.ts";
import type { MonitorService } from "./monitorService.ts";

export interface MonitorSchedulerStatus {
  started: boolean;
  cycleInProgress: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export class MonitorScheduler {
  #service: MonitorService;
  #timer: NodeJS.Timeout | null = null;
  #cycleInProgress = false;
  #started = false;
  #nextRunAt: Date | null = null;
  #lastRunAt: string | null = null;

  constructor(service: MonitorService) {
    this.#service = service;
  }

  start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;
    this.#timer = setInterval(() => {
      void this.tick();
    }, 60000);
    void this.tick();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#started = false;
  }

  async refreshSchedule(): Promise<void> {
    this.#nextRunAt = null;
    await this.tick();
  }

  getStatus(): MonitorSchedulerStatus {
    return {
      started: this.#started,
      cycleInProgress: this.#cycleInProgress,
      nextRunAt: this.#nextRunAt ? this.#nextRunAt.toISOString() : null,
      lastRunAt: this.#lastRunAt,
    };
  }

  async tick(): Promise<void> {
    const settings = await this.#service.getSettings();

    if (!settings.schedulerEnabled) {
      this.#nextRunAt = null;
      return;
    }

    if (!this.#nextRunAt) {
      this.#nextRunAt = findNextMonitorRun(new Date(), settings);
      return;
    }

    const now = new Date();
    if (this.#cycleInProgress || now.getTime() < this.#nextRunAt.getTime()) {
      return;
    }

    this.#cycleInProgress = true;
    try {
      await this.#service.runMonitorCycle();
      this.#lastRunAt = now.toISOString();
    } catch (error) {
      console.error("Monitor cycle failed:", error);
    } finally {
      this.#cycleInProgress = false;
      this.#nextRunAt = findNextMonitorRun(new Date(now.getTime() + 60000), settings);
    }
  }
}