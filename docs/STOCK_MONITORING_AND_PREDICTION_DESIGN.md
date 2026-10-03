# Stock Monitoring and Prediction Design

## Purpose

This document describes how to extend the current stock insights application from one-shot analysis into a monitoring system that:

1. Tracks a user-managed watchlist.
2. Pulls the latest stock value on a configurable interval.
3. Only runs polling during `9:30 AM` to `4:30 PM` Eastern Time.
4. Detects when a stock has dipped more than a configured percentage.
5. Notifies the user when a threshold is crossed.
6. Collects historical observations that can later support prediction capabilities.

It also defines where LLM-based reasoning adds value and where deterministic logic should remain in control.

## Current State

The existing application is optimized for request-time analysis:

1. A user sends a question through the UI or CLI.
2. The server resolves a ticker symbol.
3. The workflow fetches the latest market snapshot.
4. The research, risk, and summary agents generate a response.

The current system does not include:

1. Persistent watchlists.
2. Background scheduling.
3. Notification delivery.
4. Historical time-series storage.
5. Prediction or backtesting infrastructure.

## Design Goals

The extended system should satisfy two separate goals.

### Goal 1: Reliable monitoring

The monitoring engine must be deterministic and dependable. It should:

1. Poll on a fixed schedule.
2. Respect the market-hours window.
3. Compute dip thresholds consistently.
4. Avoid duplicate alerts.
5. Persist state safely.

### Goal 2: Prediction-ready evolution

The system should collect enough structured historical data to support more advanced use cases later, including:

1. Price-move prediction.
2. Rebound versus continued-drop classification.
3. Portfolio-level risk scoring.
4. LLM-generated explanations and prioritization.

## Core Architectural Principle

Do not use the LLM to drive the core alerting decision path.

### Deterministic path

The following capabilities should stay rule-based:

1. Scheduling.
2. Market-hours enforcement.
3. Quote retrieval.
4. Dip calculation.
5. Threshold crossing detection.
6. Notification deduplication.
7. Persistence.

### LLM-assisted path

The LLM should be used above the deterministic layer for:

1. Explaining why an alert fired.
2. Translating natural language into watchlist rules.
3. Summarizing monitor activity.
4. Ranking alerts when many symbols trigger.
5. Synthesizing price signals with later additions such as news, earnings, or macro commentary.

This separation keeps monitoring reliable while leaving room for more complex reasoning.

## High-Level Architecture

The future system should have two complementary flows.

### Existing on-demand analysis flow

User request -> Express API -> stock workflow -> market snapshot -> agent analysis -> response

### New monitoring and prediction flow

Watchlist configuration -> persistent storage -> scheduler tick -> market window check -> latest price fetch -> observation recorded -> dip evaluation -> alert emitted -> optional prediction -> optional LLM explanation

## Monitoring Domain Model

The monitoring subsystem needs persistent entities.

### Watchlist entry

Each monitored symbol should store:

1. `symbol`
2. `displayName`
3. `enabled`
4. `dipThresholdPercent`
5. `baselineMode`
6. `baselinePrice`
7. `lastObservedPrice`
8. `lastCheckedAt`
9. `lastAlertedAt`
10. `lastAlertedDipPercent`
11. `alertState`
12. `createdAt`
13. `updatedAt`

### Global monitor settings

The monitoring runtime should store:

1. `pollIntervalMinutes`
2. `timezone`
3. `marketWindowStart`
4. `marketWindowEnd`
5. `schedulerEnabled`

### Alert event

Each alert should capture:

1. `symbol`
2. `triggeredAt`
3. `latestPrice`
4. `baselinePrice`
5. `dipPercent`
6. `thresholdPercent`
7. `reason`
8. `observationId`

### Observation record

Prediction requires storing historical observations instead of only the latest state.

Each observation should capture:

1. `id`
2. `symbol`
3. `observedAt`
4. `price`
5. `previousClose`
6. `change`
7. `changePercent`
8. `dayHigh`
9. `dayLow`
10. `open`
11. `marketCap`
12. `isMarketOpen`
13. `fallback`
14. `source`

This observation store is the minimum viable foundation for later predictive models.

## Dip Detection Logic

The first supported rule should be percentage dip from a baseline.

### Recommended baseline

Use `previousClose` as the default baseline for the first version.

This is simple, available in the existing market snapshot, and easy for users to understand.

### Formula

$$
dipPercent = \frac{baselinePrice - latestPrice}{baselinePrice} \times 100
$$

### Trigger condition

An alert should fire when:

$$
dipPercent \ge thresholdPercent
$$

### Duplicate suppression

The system should avoid repeated alerts while the stock remains below the threshold.

Recommended behavior:

1. Alert when the threshold is crossed for the first time.
2. Do not alert again while the symbol remains in the same breached state.
3. Reset the alert state once the symbol recovers above the threshold.
4. Allow a new alert on a later downward crossing.

## Scheduling and Market Window

The scheduler should run as a background service in the same process for the first implementation.

### Default interval

The polling interval should default to `120` minutes.

### Configurability

The interval must be configurable so it can later support faster or slower monitoring.

### Allowed run window

Monitoring should only run between:

1. `9:30 AM` Eastern Time
2. `4:30 PM` Eastern Time

### Timezone requirement

The runtime must use `America/New_York` explicitly rather than the machine local timezone.

This is necessary to correctly handle:

1. Daylight saving time.
2. Deployments outside Eastern Time.
3. Consistent market-hours enforcement.

### Recommended scheduling behavior

Prefer clock-aligned runs within the allowed window, for example:

1. `9:30 AM ET`
2. `11:30 AM ET`
3. `1:30 PM ET`
4. `3:30 PM ET`

This is more predictable than starting a simple repeating timer from process boot time.

## Persistence Strategy

The current application is a single-process Node.js server, so the first persistence layer should be lightweight.

### Recommended first implementation

Use a file-backed repository such as JSON storage for:

1. Monitor settings.
2. Watchlist entries.
3. Alert history.
4. Historical observations.

### Why this works for the first version

1. Minimal operational overhead.
2. Easy local development.
3. Fast implementation.
4. Sufficient for a single app instance.

### Future upgrade path

Abstract persistence behind repository interfaces so the storage implementation can later be swapped for:

1. SQLite
2. Postgres
3. Redis-backed coordination plus durable database storage

## Prediction Capability

If prediction is a product goal, the system should not treat the LLM as the predictor of record.

Instead, prediction should be built on structured historical data and explicit model outputs.

## Prediction target examples

Prediction becomes meaningful only when the target is clearly defined. Examples:

1. Probability the stock drops more than `3%` in the next trading day.
2. Probability the stock rebounds within the next two sessions.
3. Expected end-of-day price band.
4. Short-term risk score for monitored stocks.
5. Classification such as `likely rebound`, `likely continue lower`, or `uncertain`.

### Recommended initial predictive output

Start with a simple classification or probability score rather than open-ended price forecasting.

Examples:

1. `nextSessionDipRisk`
2. `reboundProbability`
3. `confidence`

## Prediction Architecture

Prediction should sit downstream from data collection.

### Step 1: Historical observation storage

Record every polling cycle for every monitored stock.

### Step 2: Feature engineering

Compute structured features from observations, such as:

1. Rolling returns.
2. Intraday drawdown.
3. Distance from previous close.
4. Distance from open.
5. Volatility over the last `n` observations.
6. Dip velocity.
7. Time-of-day position.
8. Alert frequency over recent sessions.

### Step 3: Prediction service

Introduce a prediction service that consumes features and returns structured outputs.

### Step 4: LLM explanation layer

Once a structured prediction exists, the LLM can explain it in plain language.

## Role of LLMs in Complex Scenarios

An LLM adds value when the system moves beyond single-rule alerts.

### Useful LLM scenarios

1. Explaining why a dip is notable.
2. Comparing several triggered stocks and ranking urgency.
3. Summarizing monitor activity for the day.
4. Turning prompts such as "watch semiconductor names with unusual weakness" into structured watchlist updates.
5. Combining numeric signals with textual signals such as earnings summaries or macro headlines.

### Non-useful LLM scenarios

The LLM should not be trusted as the sole mechanism for:

1. Computing dip percentage.
2. Deciding market-hours eligibility.
3. Determining whether an alert threshold was crossed.
4. Persisting or deduplicating alert state.

## API Additions

The monitoring subsystem should be exposed through explicit APIs.

### Watchlist APIs

1. `GET /api/monitors`
2. `POST /api/monitors`
3. `PATCH /api/monitors/:symbol`
4. `DELETE /api/monitors/:symbol`

### Settings APIs

1. `GET /api/monitor-settings`
2. `PATCH /api/monitor-settings`

### Alert APIs

1. `GET /api/alerts`

### Observation APIs

1. `GET /api/observations?symbol=AAPL`

### Prediction APIs

1. `GET /api/predictions?symbol=AAPL`
2. `POST /api/predictions/recompute`

The exact prediction endpoints can evolve, but the important point is that predictions should be returned as structured outputs, not only narrative text.

## UI Additions

The current UI should be extended rather than replaced.

### New UI areas

1. Watchlist management panel.
2. Monitoring settings panel.
3. Alerts panel.
4. Observation history view.
5. Prediction summary panel.

### Example user-visible capabilities

1. Add a stock to monitoring.
2. Remove a stock from monitoring.
3. Set a dip threshold per stock.
4. View last observed price.
5. View whether the stock is currently in alert state.
6. View recent alerts.
7. View a simple prediction label or score.
8. Request an LLM explanation of the latest alert or prediction.

## Recommended Module Additions

The codebase should gain a new monitoring area and a prediction area.

### Monitoring modules

1. `src/monitoring/monitorTypes.ts`
2. `src/monitoring/monitorRepository.ts`
3. `src/monitoring/fileMonitorRepository.ts`
4. `src/monitoring/marketWindow.ts`
5. `src/monitoring/dipEvaluator.ts`
6. `src/monitoring/notifier.ts`
7. `src/monitoring/inAppNotifier.ts`
8. `src/monitoring/monitorService.ts`
9. `src/monitoring/monitorScheduler.ts`
10. `src/routes/monitorRoutes.ts`

### Prediction modules

1. `src/prediction/predictionTypes.ts`
2. `src/prediction/featureEngineering.ts`
3. `src/prediction/predictionService.ts`
4. `src/prediction/ruleBasedPredictor.ts`
5. `src/prediction/modelPredictor.ts`
6. `src/prediction/predictionExplainer.ts`

## Existing Files Likely To Change

1. `src/server.ts` to register routes and start the scheduler.
2. `src/config.js` to add monitoring and prediction settings.
3. `public/index.html` to add monitoring and prediction UI sections.
4. `public/app.js` to support watchlist, alerts, and predictions.
5. `public/styles.css` to style the new UI.

The existing one-shot workflow should remain intact and should not become the source of truth for monitoring decisions.

## Configuration Additions

Recommended environment variables:

1. `MONITOR_POLL_INTERVAL_MINUTES=120`
2. `MONITOR_TIMEZONE=America/New_York`
3. `MONITOR_WINDOW_START=09:30`
4. `MONITOR_WINDOW_END=16:30`
5. `MONITOR_STORAGE_PATH=./data/stock-monitors.json`
6. `MONITOR_SCHEDULER_ENABLED=true`

Optional future variables:

1. `DEFAULT_DIP_THRESHOLD_PERCENT=5`
2. `ALERT_COOLDOWN_MINUTES=0`
3. `PREDICTION_ENABLED=false`
4. `PREDICTION_MODEL_PATH=`

## Failure Handling

The monitoring and prediction system should fail safely.

### Monitoring failures

1. Quote fetch failure should be recorded and skipped, not treated as an alert.
2. Storage write failure should be logged and must not silently corrupt state.
3. Scheduler overlap should be prevented so only one monitoring cycle runs at a time.
4. App restart should reload watchlist and monitor state from storage.

### Prediction failures

1. Missing historical data should result in `insufficient_data` rather than fabricated predictions.
2. Model errors should return structured failure states.
3. LLM explanation failure should not block deterministic alerts or structured predictions.

## Testing Strategy

### Unit tests

1. Dip percentage calculation.
2. Threshold crossing transitions.
3. Duplicate alert suppression.
4. Market window evaluation in `America/New_York`.
5. Feature calculation from observation history.
6. Prediction output shape and fallback behavior.

### Integration tests

1. Add and remove watchlist entries.
2. Scheduler skips runs outside market hours.
3. Scheduler emits alert on threshold crossing.
4. Observation history is persisted after polling.
5. Prediction endpoints return structured values once enough observations exist.

### Backtesting requirement

Prediction quality cannot be trusted without backtesting.

The data model should therefore support answering questions such as:

1. When the system observed a given pattern, what happened in the next session?
2. How often did a rebound prediction succeed?
3. Which features correlated most with false positives?

## Suggested Delivery Phases

### Phase 1: Monitoring foundation

1. Add watchlist persistence.
2. Add scheduler and market-window enforcement.
3. Add dip evaluator.
4. Add alert state and notification history.
5. Add observation recording.

### Phase 2: Product surface

1. Add monitor APIs.
2. Add alert APIs.
3. Add UI for watchlist, settings, and alerts.

### Phase 3: Prediction baseline

1. Add feature engineering.
2. Add a simple rule-based or statistical predictor.
3. Return structured prediction outputs.
4. Add prediction history and validation.

### Phase 4: LLM enhancement

1. Add prediction explanations.
2. Add daily summaries.
3. Add natural-language monitor management.
4. Add multi-signal reasoning across price, news, and events.

## Final Recommendation

If the goal is dependable stock monitoring, the execution path should stay deterministic.

If the goal is more complex scenarios and future prediction, the system should start collecting structured historical observations immediately and add a dedicated prediction layer on top of that data.

The LLM should be treated as a reasoning and explanation layer, not as the core numeric prediction engine.