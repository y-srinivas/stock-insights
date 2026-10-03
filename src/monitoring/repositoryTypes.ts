import type { MonitorStoreData } from "./monitorTypes.ts";

export interface MonitorRepository {
  getState(): Promise<MonitorStoreData>;
  mutate<T>(mutator: (state: MonitorStoreData) => T | Promise<T>): Promise<T>;
}