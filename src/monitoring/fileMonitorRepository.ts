import fs from "node:fs/promises";
import path from "node:path";

import { MONITOR_STORAGE_PATH } from "../config.js";
import { buildDefaultMonitorState } from "./monitorRepository.ts";
import type { MonitorStoreData } from "./monitorTypes.ts";
import type { MonitorRepository } from "./repositoryTypes.ts";

export class FileMonitorRepository implements MonitorRepository {
  #storagePath: string;
  #pendingMutation: Promise<unknown> = Promise.resolve();

  constructor(storagePath = MONITOR_STORAGE_PATH) {
    this.#storagePath = storagePath;
  }

  async getState(): Promise<MonitorStoreData> {
    return this.#readState();
  }

  async mutate<T>(mutator: (state: MonitorStoreData) => T | Promise<T>): Promise<T> {
    const runMutation = async (): Promise<T> => {
      const state = await this.#readState();
      const result = await mutator(state);
      await this.#writeState(state);
      return result;
    };

    const chained = this.#pendingMutation.then(runMutation, runMutation);
    this.#pendingMutation = chained.then(() => undefined, () => undefined);
    return chained;
  }

  async #readState(): Promise<MonitorStoreData> {
    try {
      const raw = await fs.readFile(this.#storagePath, "utf8");
      const parsed = JSON.parse(raw) as MonitorStoreData;
      return this.#mergeWithDefaults(parsed);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        const initialState = buildDefaultMonitorState();
        await this.#writeState(initialState);
        return initialState;
      }
      throw error;
    }
  }

  async #writeState(state: MonitorStoreData): Promise<void> {
    await fs.mkdir(path.dirname(this.#storagePath), { recursive: true });
    await fs.writeFile(this.#storagePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  #mergeWithDefaults(state: Partial<MonitorStoreData> | null | undefined): MonitorStoreData {
    const defaults = buildDefaultMonitorState();

    return {
      settings: {
        ...defaults.settings,
        ...(state?.settings || {}),
      },
      digest: {
        ...defaults.digest,
        ...(state?.digest || {}),
      },
      monitors: Array.isArray(state?.monitors) ? state.monitors : [],
      alerts: Array.isArray(state?.alerts) ? state.alerts : [],
      observations: Array.isArray(state?.observations) ? state.observations : [],
    };
  }
}