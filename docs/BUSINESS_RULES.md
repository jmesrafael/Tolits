# BUSINESS_RULES.md — Domain Logic, Intervals, Edge Cases

> **Owns:** the canonical component set, default intervals, due-status math, component detail fields, odometer rules, fuel math, PH document rules, and statistics definitions. **Does not own:** the Health Score formula ([HEALTH_SCORE.md](HEALTH_SCORE.md)), notification timing ([NOTIFICATION_ENGINE.md](NOTIFICATION_ENGINE.md)), storage schema ([DATABASE_DESIGN.md](DATABASE_DESIGN.md)). These rules are implemented in the service layer only ([SOFTWARE_ARCHITECTURE.md](SOFTWARE_ARCHITECTURE.md) §4) and unit-tested exhaustively ([TESTING.md](TESTING.md) §4).

## 1. Principles

- Every rule here is deterministic and unit-testable; no rule may be re-implemented in a component ([DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)).
- Default values are **assumptions** pending the Phase-2 model database (R-33) — each is listed in the Assumptions Log ([DECISION_LOG.md](DECISION_LOG.md) A-04). They are seed data (config), not hard-code, so per-model defaults can arrive later without an app update.

## 2. Canonical component set

`component_type` enum — exact string values used in DB, code, i18n keys, and notifications. Applicability: ✔ = schedule auto-created **enabled**; ○ = auto-created **disabled** (user can enable); — = not created.

| # | `component_type` | Display (en) | cvt | chain | other | Default service type |
|---|---|---|---|---|---|---|
| 1 | `engine_oil` | Engine oil | ✔ | ✔ | ✔ | replace |
| 2 | `gear_oil` | Gear oil | ✔ | — | ○ | replace |
| 3 | `oil_filter` | Oil filter | ○ | ✔ | ✔ | replace |
| 4 | `air_filter_clean` | Air filter cleaning | ✔ | ✔ | ✔ | clean |
| 5 | `air_filter_replace` | Air filter replacement | ✔ | ✔ | ✔ | replace |
| 6 | `spark_plug` | Spark plug | ✔ | ✔ | ✔ | replace |
| 7 | `coolant` | Coolant | ○ | ○ | ○ | replace |
| 8 | `brake_fluid` | Brake fluid | ✔ | ✔ | ✔ | replace |
| 9 | `brake_pads_front` | Front brake pads | ✔ | ✔ | ✔ | replace |
| 10 | `brake_pads_rear` | Rear brake pads/shoes | ✔ | ✔ | ✔ | replace |
| 11 | `tire_front` | Front tire | ✔ | ✔ | ✔ | replace |
| 12 | `tire_rear` | Rear tire | ✔ | ✔ | ✔ | replace |
| 13 | `battery` | Battery | ✔ | ✔ | ✔ | replace |
| 14 | `cvt_cleaning` | CVT cleaning | ✔ | — | — | clean |
| 15 | `cvt_belt` | CVT belt | ✔ | — | — | replace |
| 16 | `cvt_rollers` | CVT rollers | ✔ | — | — | replace |
| 17 | `cvt_slider` | CVT sliders | ✔ | — | — | replace |
| 18 | `clutch_cleaning` | Clutch cleaning | ✔ | — | — | clean |
| 19 | `chain_lube` | Chain clean & lube | — | ✔ | — | clean |
| 20 | `chain_replacement` | Chain replacement | — | ✔ | — | replace |
| 21 | `sprockets` | Sprockets | — | ✔ | — | replace |
| 22 | `custom` | (user-named) | ✔* | ✔* | ✔* | user-set |

\* `custom` rows are created only by the user (`custom_name` on the schedule, [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §5.2). `coolant` defaults disabled because many PH bikes are air-cooled; UI hint: "Enable if your bike is liquid-cooled (NMAX, ADV, Aerox…)".

**Service types:** `replace` | `clean` | `adjust`. A record's service type defaults from the table above; components allowing alternatives: `spark_plug` (+clean), `brake_pads_*` (+adjust), `chain_lube` is always `clean`, `custom` free choice. Service type is informational except where noted (oil-change count, [HEALTH_SCORE.md](HEALTH_SCORE.md) anchor rule §5: any record of a schedule re-anchors it regardless of service type).

## 3. Default intervals (seed config, per-bike editable)

“Whichever comes first” applies when both dimensions exist.

| `component_type` | interval_km | interval_months |
|---|---|---|
| engine_oil | 1,500 | 3 |
| gear_oil | 4,500 | 6 |
| oil_filter | 8,000 | 12 |
| air_filter_clean | 4,000 | 6 |
| air_filter_replace | 12,000 | 12 |
| spark_plug | 8,000 | 12 |
| coolant | 20,000 | 24 |
| brake_fluid | 20,000 | 24 |
| brake_pads_front | 12,000 | 24 |
| brake_pads_rear | 12,000 | 24 |
| tire_front | 25,000 | 60 |
| tire_rear | 15,000 | 60 |
| battery | — | 24 |
| cvt_cleaning | 4,000 | 6 |
| cvt_belt | 24,000 | 24 |
| cvt_rollers | 12,000 | 18 |
| cvt_slider | 12,000 | 18 |
| clutch_cleaning | 8,000 | 12 |
| chain_lube | 700 | 1 |
| chain_replacement | 25,000 | 36 |
| sprockets | 25,000 | 36 |

Sources: brief (engine oil 1,500/3) + common PH scooter/underbone service practice; **all values are assumptions A-04** pending model data. Rear tire < front tire because rear wears faster under load.

## 4. Due status (single definition)

For an **enabled, anchored** schedule:

```
km_used   = current_effective_odo − anchor_effective_odo     (only if interval_km set)
days_used = today − anchor_date, in days                     (only if interval_months set;
                                                              interval_days = interval_months × 30.44, rounded)
r = max(km_used / interval_km, days_used / interval_days)    (over the dimensions that exist)
```

| Status | Condition | Color token ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §2.1) |
|---|---|---|
| **OK** | `r < 0.80` | `status.good` (green) |
| **Due soon** | `0.80 ≤ r < 1.00` | `status.dueSoon` (amber) |
| **Overdue** | `r ≥ 1.00` | `status.overdue` (red) |
| **Unknown** | schedule un-anchored | `status.neutral` (gray) |

(The token ramp also defines `status.excellent`/`status.critical` — consumed by Health Score display bands, [HEALTH_SCORE.md](HEALTH_SCORE.md) §6; per-schedule due status remains the three levels + Unknown above.)

Remaining text: `remaining_km = interval_km − km_used`, `remaining_days = interval_days − days_used`; UI shows the dimension that will expire **first** (smaller remaining fraction). Negative values render "overdue by X".

**Anchoring:** anchor = the schedule's most recent maintenance record (by date, ties by odometer), or the user baseline if no record exists ([FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md) §5.4). Un-anchored schedules: no status, no reminders, excluded from Health Score, counted in "setup incomplete".

## 5. Component-specific detail fields (optional, on maintenance records)

Stored in `maintenance_records.details` (JSON validated by per-component Zod schema — [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §5.3, ADR-007):

| Component | Detail fields |
|---|---|
| engine_oil | oil type (`mineral`/`semi_synthetic`/`fully_synthetic`), viscosity (e.g. `10W-40`), quantity_liters (0.1–5) |
| gear_oil | quantity_ml (50–500) |
| spark_plug | plug code (free text ≤ 20) |
| battery | brand, voltage (`12V` default), warranty_months (0–60) |
| tire_front / tire_rear | brand, size (e.g. `80/90-14`), tread_remaining_pct (0–100), pressure_psi (10–60) |
| brake_pads_front / rear | pads_remaining_pct (0–100) |
| cvt_belt | belt code (free text ≤ 20) |
| chain_replacement / sprockets | brand, size (e.g. `428×122`) |
| all others | none beyond common fields ([FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md) §6.1) |

`tread_remaining_pct` / `pads_remaining_pct` from the latest record are displayed on component detail (S-11) as wear indicators; they do **not** modify `r` in MVP (parts-life prediction is Phase-2 R-38).

## 6. Odometer rules

- 6.1 **Source of truth:** `odometer_logs` — one row per reading with `reading_km` (raw), `effective_km` (see 6.4), `recorded_at`, `source` (`manual` | `fuel` | `maintenance` | `repair` | `initial`). Every odometer-bearing save inserts here. `motorcycles.current_odometer_km` caches the max `effective_km` (maintained transactionally, [DATA_FLOW.md](DATA_FLOW.md) §4).
- 6.2 **Monotonicity:** effective km must be non-decreasing over `recorded_date` order (ties broken by `created_at`). A new reading must be ≥ the latest earlier reading and ≤ the earliest later reading (relevant when back-dating records).
- 6.3 **Violation handling (never silently accept or reject):** entering a reading lower than the last known shows three options — “I mistyped” (re-enter), “A past entry is wrong” (→ odometer log S-25b to edit the offending entry), “The odometer/meter was replaced” (→ 6.4). Back-dated entries that fit between neighbors are accepted normally.
- 6.4 **Meter replacement:** user confirms new meter's current reading `n`. The bike's `odometer_offset_km` becomes `current_effective_max − n`. Every log row stores `effective_km = reading_km + offset_at_insert`, so history stays consistent and all interval math uses effective km. Raw reading remains displayed on the odometer log for transparency.
- 6.5 **Deleting/editing** an odometer-bearing record re-validates 6.2 across neighbors and re-runs the recalculation cascade ([DATA_FLOW.md](DATA_FLOW.md) §4). If the deleted row was the max, the cache recomputes. **Editing a row keeps its original offset**: the offset that applied at insert is recoverable as `effective_km − reading_km`; the edited `reading_km` is re-combined with that same per-row offset — the current bike offset is never retroactively applied to pre-reset rows (ADR-009).

## 7. Fuel mathematics

- 7.1 **Price/liter:** `total_cost / liters` (display 2 decimals). Any two of {liters, total, price/L} entered → third computed.
- 7.2 **Consumption spans:** only between consecutive **full-tank** fills: `km = odo₂ − odo₁` (effective); `liters = Σ liters of all fills after fill₁ up to and including fill₂`. Then `km/L = km / liters`, `L/100km = 100 / (km/L)`. Spans with `km ≤ 0` or `km > 2,000` are excluded as implausible (A-07).
- 7.3 **Averages:** displayed km/L = mean of the last 5 valid spans. Cost/km (fuel) = `Σ fuel cost / (odo_last − odo_first)` over the trailing-90-day window with ≥ 2 readings; otherwise lifetime; otherwise "—".
- 7.4 **Monthly fuel cost:** calendar-month sum of `total_cost`.
- 7.5 **Daily-km rate (used by notification projection [NOTIFICATION_ENGINE.md](NOTIFICATION_ENGINE.md) §4, status/Health Score estimates and the estimated-odometer display):** `(max effective − min effective) / days`, where `days` = days between the first and last reading in the window (not the window length), over the 30 days of odometer logs **ending at the latest reading** (not today — time passing alone must not empty the window); if < 2 readings on distinct dates, widen to 90 days; if still < 2, default **25 km/day**; clamp to [5, 300]. Confidence is `high` only for a measured 30-day rate whose latest reading is ≤ 30 days old; otherwise `low`. The 25 km/day default is an assumption, not evidence of riding: it never produces an estimated odometer or an assumption-only overdue status (the UI asks for another reading instead). Single implementation: `FuelService.computeDailyKmRate`.

## 8. Documents & PH-specific rules

- 8.1 Expiry-capable types: `orcr` (registration), `insurance`, `license`. Expiry drives reminders (30/7/1-day, [NOTIFICATION_ENGINE.md](NOTIFICATION_ENGINE.md) §7) and badges (S-26). Expiry is **user-entered**; Tolits never guesses a legal deadline.
- 8.2 **Registration month hint (PH):** when a plate number exists, the last digit hints the LTO renewal month (1→Jan … 0→Oct) — shown as a *suggestion* when setting OR/CR expiry ("Plates ending in 4 usually renew in April"). This mapping is config data (`config/ph.ts`), not hard-code, per the localization bet ([FUTURE_ROADMAP.md](FUTURE_ROADMAP.md)). It is a hint only (A-08).
- 8.3 Registration/insurance expiry is **excluded from Health Score** (legal ≠ mechanical) but surfaces as Dashboard warnings (S-04) and reminders.

## 9. Statistics & expense aggregation (single definitions)

- 9.1 **Unified expense view** (read-time union, no duplicate rows): fuel_logs → category `fuel`; maintenance_records (cost > 0) → `oil` if component ∈ {engine_oil, gear_oil}, `tires` if ∈ {tire_front, tire_rear}, else `service`; repairs → `repair`; expenses → their own category. Category enum (11): `fuel, oil, tires, service, repair, registration, insurance, parking, accessories, washing, other`.
- 9.2 **Totals** (per bike / all bikes): km tracked = `effective_max − effective_min`; spend totals per source; overall = union sum; oil-change count = maintenance records with `engine_oil` + service `replace`.
- 9.3 **Average monthly spend:** sum of union over the last 12 calendar months (incl. current) ÷ `min(12, months since first money record, ≥ 1)`.
- 9.4 **Cost/km (overall):** union spend in trailing 12 months ÷ km tracked in the same window; requires ≥ 2 odometer readings in window and km > 0, else "—". Purchase price is excluded (shown separately via the cost-of-ownership toggle, S-28).
- 9.5 All statistics ignore soft-deleted rows and archived bikes are excluded from "all bikes" aggregates by default (toggle to include).

## 10. Cross-cutting edge cases

| Case | Rule |
|---|---|
| Record dated before bike's first odometer log | Allowed (historical import); it may become the schedule anchor; monotonicity checked against neighbors only |
| Two records same component same day | Allowed; latest by odometer anchors |
| Schedule disabled while reminder scheduled | Cancel its notifications immediately ([NOTIFICATION_ENGINE.md](NOTIFICATION_ENGINE.md) §5) |
| Bike archived | Excluded from reminders, score list, aggregates (9.5); data intact |
| Device clock moved backwards | Timestamps may look out of order; ordering for anchors uses event *date* fields, not `created_at` |
| Free user with 3+ bikes after Pro refund/restore failure | Never delete data: extra bikes become read-only (view/export allowed, no new logs) until Pro restored ([PREMIUM_SYSTEM.md](PREMIUM_SYSTEM.md) §6) |
| All schedules disabled | Health Score shows "—"; Dashboard prompts re-enable |
| `active_bike_id` points to a deleted/archived bike (restore, purge, archive races) | Fall back to the first non-archived bike; if none, route to add-bike; never crash on a dangling id |
| Leap years / month lengths | `interval_days = round(interval_months × 30.44)` — deterministic across platforms |

## 11. Evolution

- **MVP:** rules above; defaults as versioned seed config.
- **Phase 2:** per-model defaults from the model database (R-33) replace the §3 assumptions for known bikes (user-edited values always win); wear-informed adjustments feed [HEALTH_SCORE.md](HEALTH_SCORE.md) §9; receipt-scanner output (R-32) enters through the same validation as manual input.
- **Phase 3:** workshop-entered records (R-50) obey identical rules — `source` differs, math doesn't.
- **Long-term:** per-country config modules (registration rules, station/brand lists) extend §8 without touching core rules ([LOCALIZATION.md](LOCALIZATION.md) §7).
