import type { DailyDigestPayload } from "./monitorTypes.ts";

export interface MonitorNotifier {
  notifyDailyDigest(payload: DailyDigestPayload): Promise<void>;
}