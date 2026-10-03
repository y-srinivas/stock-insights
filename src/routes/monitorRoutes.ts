import express from "express";

import type { MonitorScheduler } from "../monitoring/monitorScheduler.ts";
import type { MonitorService } from "../monitoring/monitorService.ts";

function parseLimit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

export function createMonitorRouter({
  monitorService,
  monitorScheduler,
}: {
  monitorService: MonitorService;
  monitorScheduler: MonitorScheduler;
}) {
  const router = express.Router();

  router.get("/monitors", async (req, res) => {
    try {
      const monitors = await monitorService.listMonitors();
      res.json({ monitors });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load monitors.";
      res.status(500).json({ error: message });
    }
  });

  router.post("/monitors", async (req, res) => {
    try {
      const monitor = await monitorService.createMonitor(req.body || {});
      res.status(201).json({ monitor });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create monitor.";
      res.status(400).json({ error: message });
    }
  });

  router.patch("/monitors/:symbol", async (req, res) => {
    try {
      const monitor = await monitorService.updateMonitor(req.params.symbol, req.body || {});
      res.json({ monitor });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update monitor.";
      res.status(400).json({ error: message });
    }
  });

  router.delete("/monitors/:symbol", async (req, res) => {
    try {
      const removed = await monitorService.deleteMonitor(req.params.symbol);
      if (!removed) {
        return res.status(404).json({ error: "Monitor not found." });
      }
      return res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete monitor.";
      return res.status(500).json({ error: message });
    }
  });

  router.get("/monitor-settings", async (req, res) => {
    try {
      const settings = await monitorService.getSettings();
      const digest = await monitorService.getDigestStatus();
      res.json({ settings, digest, scheduler: monitorScheduler.getStatus() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load monitor settings.";
      res.status(500).json({ error: message });
    }
  });

  router.patch("/monitor-settings", async (req, res) => {
    try {
      const settings = await monitorService.updateSettings(req.body || {});
      await monitorScheduler.refreshSchedule();
      const digest = await monitorService.getDigestStatus();
      res.json({ settings, digest, scheduler: monitorScheduler.getStatus() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update monitor settings.";
      res.status(400).json({ error: message });
    }
  });

  router.get("/alerts", async (req, res) => {
    try {
      const alerts = await monitorService.listAlerts(parseLimit(req.query.limit, 50));
      res.json({ alerts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load alerts.";
      res.status(500).json({ error: message });
    }
  });

  router.get("/observations", async (req, res) => {
    try {
      const observations = await monitorService.listObservations({
        symbol: typeof req.query.symbol === "string" ? req.query.symbol : undefined,
        limit: parseLimit(req.query.limit, 100),
      });
      res.json({ observations });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load observations.";
      res.status(500).json({ error: message });
    }
  });

  router.post("/monitor-cycle", async (req, res) => {
    try {
      const result = await monitorService.runMonitorCycle();
      res.json({ result, scheduler: monitorScheduler.getStatus() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run monitor cycle.";
      res.status(500).json({ error: message });
    }
  });

  return router;
}