# NOTIFICATION_ENGINE.md — Reminder Scheduling Logic & Copy

> The single authoritative spec for when notifications fire and what they say. Consumes due-status math from [BUSINESS_RULES.md](BUSINESS_RULES.md) §4 and the daily-km rate from §7.5. Implemented by `ReminderPlanner` (pure planning) + `NotificationScheduler` (expo-notifications adapter) — see [SOFTWARE_ARCHITECTURE.md](SOFTWARE_ARCHITECTURE.md) §4. User-facing settings surface: [SCREEN_SPECIFICATIONS.md](SCREEN_SPECIFICATIONS.md) S-31.

## 1. Principles

1. **Local only in MVP** — all notifications are scheduled on-device with `expo-notifications`; zero server involvement ([PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) §7).
2. **Deterministic** — given the same data and settings, the planner produces the same plan. The plan is fully recomputed (never patched) on every trigger (§5).
3. **Respectful** — bounded frequency, quiet hours, per-type and per-schedule opt-outs. A reminder app that annoys gets uninstalled; competitor reviews prove it ([PRODUCT_VISION.md](PRODUCT_VISION.md) §2).
4. **Trust over cleverness** — if projection confidence is low (sparse odometer data), say "around", never a false-precise date.

## 2. Notification types

| Type | Trigger basis | Default | Channel (Android) |
|---|---|---|---|
| `maintenance_due` | schedule approaching due (§3–4) | on | `maintenance` (high importance) |
| `maintenance_overdue` | schedule past due (§4) | on | `maintenance` |
| `document_expiry` | document expiry date (§7) | on | `documents` (high) |
| `backup_reminder` | last backup age (§7) | on | `utility` (default importance) |

iOS uses category identifiers with the same names. Per-type toggles in S-31; per-schedule mute on S-13.

## 3. Time-based reminders

For a schedule with `interval_months`: due date = `anchor_date + interval_days` ([BUSINESS_RULES.md](BUSINESS_RULES.md) §4). Schedule notifications at **7 days before** and **on the due date**, at the user's fire time (default 08:00 local).

## 4. Km-based reminders (projection)

Km can't fire a clock, so due-km is projected to a date:

```
remaining_km   = interval_km − (last_actual_odo − anchor_km)      # km left at the last ACTUAL reading
rate           = daily-km rate (BUSINESS_RULES §7.5: 30d window → 90d → default 25, clamp [5,300])
projected_due  = last_reading_date + ceil(remaining_km / rate) days
```

Projection starts from the **date of the last actual reading**, not today — otherwise every day without a new reading would push the due date later. The estimated current odometer (`last_actual_odo + rate × days_since_last_reading`, rounded to 10 km) is computed live, labelled "estimated" wherever shown, and never stored as a reading. **No riding history** (rate = 25 km/day default): no riding is assumed for the days already elapsed — the projection runs from today, so a parked bike never becomes overdue on the assumption alone (its actual remaining km or time interval still can). Notification copy (`{remainingKm}`, overdue amount, remaining days) is computed for **each notification's own fire date**, and every re-plan (§5, incl. app foreground) refreshes it.

Notifications at **projected_due − 3 days** and **projected_due**, at fire time. If both km and time dimensions exist, plan from whichever due point is **earlier**; never notify twice for the same schedule on the same day (dedup §5).
**Projection confidence:** `low` if the rate came from the 90-day fallback or default — copy then uses "around/soon" phrasing (§8). Every odometer update re-projects (§5), so accuracy self-corrects as data arrives.
The pre-filled odometer in Quick Log uses the same projection: `current_effective_odo + rate × days_since_last_reading` (rounded to 10 km).

## 5. Re-planning (the only scheduling algorithm)

On **any** of: maintenance record saved/edited/deleted · odometer log added/edited/deleted · fuel log saved (odometer) · schedule edited/enabled/disabled/muted · baseline set · document saved/deleted · bike archived/deleted · settings changed (fire time, quiet hours, toggles) · **every app foreground** (cheap no-op diff when nothing changed; this is also the reboot/timezone recovery path — see §9a):

1. Cancel all pending notifications owned by Tolits (tracked in `scheduled_notifications`, [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §5.9).
2. Compute the full desired plan across all non-archived bikes: for each enabled, anchored, un-muted schedule → §3/§4 entries; each document with expiry → §7; backup reminder → §7.
3. Apply constraints: drop past dates except overdue logic (§6) — "past" is judged on the final fire instant, so a today entry whose fire time has already passed is dropped, not moved; quiet-hours shift (§6); dedup per schedule per day; **cap: 12 pending per bike, 48 total** (headroom under iOS's 64-pending limit) — priority order: overdue > document expiry > due soon > backup, then nearest-date first.
4. Schedule via expo-notifications; persist `(notification_id, source_type, source_id, fire_at)` rows.

The planner is a pure function `plan(data, settings, now) → PlanEntry[]`; the scheduler diffs/executes. This makes §3–§7 fully unit-testable without the OS ([TESTING.md](TESTING.md) §4).

## 6. Overdue, snooze, quiet hours

- **Overdue nags:** when a schedule crosses `r ≥ 1.00`, plan weekly repeats at fire time, **max 3**, then silence until its data changes (any re-anchor/edit restarts the cycle). Overdue items always remain visible in-app (S-05, S-04); once the last nag date has passed (or the schedule is muted), S-05 labels the item "Overdue since {date}. No more notifications will be sent" so the silence is explicit (`overdueNotificationsEnded`, shared with the planner).
- **Snooze (per item, from S-05):** suppresses that schedule's notifications for 7 days (`snoozed_until` on the schedule); plan step 2 skips snoozed schedules.
- **Quiet hours (default 21:00–07:00):** any computed fire time inside the window moves to the next 08:00 (or user fire time if later). Fire time and quiet hours are stored in `app_settings`.

## 7. Document expiry & backup reminders

- **Document expiry:** for `orcr`/`insurance`/`license` with an expiry date: notify at **30, 7, and 1 day(s) before**, at fire time; if already expired when saved, one immediate-next-fire-time notification, once.
- **Backup reminder:** if `last_backup_at` is null or > 30 days old, one notification per 30-day cycle ("Your data isn't backed up — takes 1 minute"). Cleared by completing a backup ([BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)).

## 8. Copy guidelines (canonical templates)

All copy via i18n keys `notification.*` ([LOCALIZATION.md](LOCALIZATION.md)); en templates below are canonical. Always: bike nickname, the component, and a concrete quantity. Title ≤ 40 chars, body ≤ 120. Never guilt-trip; never exclamation-marked alarm.

| Key | en template |
|---|---|
| `notification.due.km` | **{component} due soon** · "{bike}: {component} in about {remaining_km} km." |
| `notification.due.time` | **{component} due {relative_day}** · "{bike}: {component} is due {relative_day}." |
| `notification.due.low_confidence` | **{component} coming up** · "{bike}: {component} is due around {date}. Update your odometer for a better estimate." |
| `notification.overdue` | **{component} overdue** · "{bike}: {component} was due {overdue_amount} ago. A quick log takes 10 seconds." |
| `notification.document_expiry` | **{doc_type} expires {relative_day}** · "{bike}: renew before {date} to avoid penalties." |
| `notification.backup` | **Back up your records** · "It's been a while — protect your service history in 1 minute." |

`{relative_day}` = "today"/"tomorrow"/"in 7 days" (localized). Tap behavior: deep link to Quick Log pre-filled (maintenance types), Documents (expiry), Backup screen (backup) — [USER_FLOWS.md](USER_FLOWS.md) F-3.

## 9a. Platform reality — what the OS does and does not guarantee (binding)

Local scheduled notifications are **best-effort delivery with in-app truth as the safety net**. The Reminders list (S-05) and Dashboard are always correct; notifications are an accelerant, never the only surface. Documented limitations (ADR-025):

| Reality | Consequence | Our behavior |
|---|---|---|
| **Android: scheduled notifications do NOT survive reboot** (expo-notifications does not re-register on `BOOT_COMPLETED`) | A user who reboots and doesn't open the app gets no reminders until next open | Full re-plan on every app foreground (§5); overdue items surface immediately in-app; copy never claims real-time guarantees. iOS: scheduled locals *do* persist across reboot |
| **Doze / battery optimization / OEM task killers** may delay or drop alarms (delivery is inexact; hours of drift possible on aggressive OEMs) | "08:00" is approximate | Treat fire times as approximate-by-design (nothing in the product needs minute precision); we do **not** request `SCHEDULE_EXACT_ALARM` (Play-policy-restricted, unjustified for maintenance reminders) |
| **Android 13+ runtime permission** (`POST_NOTIFICATIONS`) | Notifications can be denied entirely | Contextual ask (S-00e); denial leaves app fully functional (§9) |
| **iOS 64-pending-notification limit** | Plans can be truncated by the OS | Self-imposed caps 12/bike, 48 total with priority drop order (§5.3) |
| **Timezone / DST / manual clock changes** | Scheduled wall-clock times shift or misfire | Planner computes from *dates* in local time; every foreground re-plan recomputes against current device time, self-healing within one app open. No timezone is stored in MVP data (dates are calendar dates, [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) §4) |
| **Duplicates** | Cancel-and-reschedule races could double-notify | §5 serialized latest-wins queue + full cancel of persisted `scheduled_notifications` before scheduling; dedup rule per schedule per day |
| **Long absence** (user doesn't open app for weeks) | Only the ≤ 48 pre-scheduled entries fire; nothing adapts | Accepted MVP limitation; plan schedules the *next* occurrences far enough out (nearest-first priority); Phase-2 server push (R-37) is the structural fix |

QA verifies the *recovery* behavior (reboot → open app → plan restored; timezone change → open app → corrected), not OS-level persistence we cannot control ([TESTING.md](TESTING.md) §7).

## 9. Permissions & failure modes

- Permission requested in onboarding with context (S-00e); denial leaves the app fully functional — S-31 shows a re-enable path via OS settings.
- Scheduling failures (OS limit, revoked permission) are logged ([LOGGING_GUIDE.md](LOGGING_GUIDE.md)) and surfaced once as a Dashboard nudge card, never a blocking error ([ERROR_HANDLING.md](ERROR_HANDLING.md) §6).
- `scheduled_notifications` rows whose `fire_at` passed are pruned during each re-plan.

## 10. Evolution

- **MVP:** everything above.
- **Phase 2 (R-37 smart notifications):** server-assisted phrasing/timing experiments; push channel via Supabase for cross-device consistency — the local planner remains the fallback and the source of truth for *what* is due. Deep-link contract stays unchanged.
- **Phase 3:** fleet digests (weekly summary per fleet to the admin) — new type, same planner pattern.
- **Long-term:** notification analytics loop (reminder → action rate, [PROJECT_MISSION.md](PROJECT_MISSION.md) §2) tunes lead times per user.
