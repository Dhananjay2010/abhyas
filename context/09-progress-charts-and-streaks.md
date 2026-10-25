# 09 — Progress charts and streaks

## What this delivers

A Progress screen: streak tiles, body-weight trend with a weigh-in form,
volume per session, and per-lift strength — plus a bottom nav tying Today and
Progress together.

## Files

| File | Role |
|---|---|
| `supabase/migrations/20260909090000_progress_views.sql` | `session_volume`, `exercise_strength_history` |
| `src/components/charts.tsx` | `LineChart`, `BarChart`, `StatTile` |
| `src/lib/progress/streaks.ts` | Streak rules |
| `src/lib/dates.ts` | Local-date helpers |
| `src/app/progress/*` | Page, weigh-in form, action |
| `src/components/bottom-nav.tsx` | Today / Progress tabs |
| `scripts/test-streaks.ts` | 16 checks (`npm run test:streaks`) |
| `src/app/dev/charts` | Development-only chart harness |

## Aggregation happens in Postgres

Two views, both declared `with (security_invoker = on)`.

**That flag is the whole security story.** A normal view runs with the
*definer's* privileges and would bypass RLS entirely, exposing every user's
sessions to every other user. With `security_invoker` the underlying policies
on `sessions` and `session_sets` still apply.

This was verified rather than assumed: a throwaway user querying
`select count(*) from session_volume` with no filter sees exactly their own
row and no one else's.

`exercise_strength_history` caps reps at 12 in the Epley estimate, because the
formula becomes unreliable on high-rep sets.

## Streak rules

Streaks count **scheduled training days, not calendar days**:

- A **rest day is part of the plan**, so it neither extends nor breaks a
  streak — it is skipped.
- Only a scheduled active day that was not completed breaks it.
- **Today is skipped when incomplete**, because the day is not over. A
  half-finished Tuesday should not read as a failure.
- Yoga days count as training days, so missing one does break the streak.

## Chart decisions

Worked through the `dataviz` skill's procedure — form, then color, then
validate, then look at it.

**Every chart is single-series.** Per-lift strength is drawn as **small
multiples**, one chart per lift, rather than a five-line chart: five lines on a
390px screen is unreadable, and each lift is its own question. Single series
also means one hue and no legend — the heading names the series.

**The data hue is `#d95926`, not the brand accent.** The accent `#ff9a2e`
**failed** the validator's dark-mode lightness band at 0.775 — too light for
the `#151a1f` chart surface. `#d95926` passes the lightness band, the chroma
floor, and 3:1 contrast against that exact surface. It lives in
`--color-chart`; do not swap it back to the accent without re-validating.

The validator's CVD and adjacency checks are scoped to categorical palettes and
do not apply here, since no chart puts two hues side by side.

**A single data point is not a chart.** One weigh-in renders as a hero number
with an explanation, not a one-point line. An empty series renders a dashed
placeholder.

Marks follow the spec: 2px lines, rounded bar ends anchored to the baseline, a
2px gap between adjacent bars, a 2px surface ring on the active marker,
recessive hairline gridlines, and labels only at the ends of the axis rather
than on every point.

**Interaction and accessibility:** every chart takes a tap — the line charts
show a crosshair and marker, the bar chart highlights and dims the rest, and
both update a readout beneath. Each carries a descriptive `aria-label`, and a
**Show values** toggle reveals the numbers as a real table, so the data is
never available only as pixels.

## A timezone bug the streak tests caught

Writing `dateRange` surfaced a genuine defect that had already spread:

```js
new Date("2026-08-30T00:00:00").toISOString().slice(0, 10)  // "2026-08-29" in IST
```

The string parses as **local** midnight but formats as **UTC**, so in IST
(UTC+5:30) every date rolled back a day. The same pattern was in three other
places: the first weigh-in's date, and a block's `started_on` / `ends_on`.

All four now use `src/lib/dates.ts`, where the user's date comes from `Intl`
with an explicit `timeZone` and arithmetic stays inside UTC so it cannot drift.
**Never build a user-facing date with `toISOString()`.**

## Verification performed

- **Streaks** — 16 checks, all passing: rest days do not break a streak, a
  missed training day does, an unfinished today does not, yoga counts, and
  longest is remembered across a break.
- **Views** — RLS isolation confirmed on the live database with a throwaway
  user; volume computed correctly (10×60 + 10×60 + 8×60 = 1680 kg).
- **Palette** — `validate_palette.js` run against the real surface; all
  applicable checks pass for the shipped hue.
- **Charts rendered and inspected** in the dev harness at 375px: line, bar,
  small-multiple, single-point and empty states. Tapping the bar chart moved
  the readout from "6320 kg · 7 Sep" to "4820 kg · 12 Aug"; the value table
  opened with 7 rows.

## Bug: a same-day rebuild zeroed the streak

`buildDayRecords` attributed each date to the **first** program covering it.
Rebuilding a block leaves two programs starting the same day, and the older,
retired one had a different schedule — so a training day was read as a rest day
and the streak skipped a session the user had just completed. The screen showed
"Streak 0" beside "Days trained 1".

It now searches newest-first, and the Progress page orders programs by
`started_on` then `created_at` so "newest" is well defined on a same-day
rebuild.

## Known gaps

- Not verified against a real signed-in account with real history — the
  harness uses fixture data, and no session has yet been completed for real.
- No date-range filter; the page shows the last 14 sessions and 120 weigh-ins.
- ~~Streaks are computed only from the active block, so they reset when a new
  block is built.~~ **Fixed in step 11**: `buildDayRecords` walks every block.
- `bodyweight_prompt` in settings is stored but nothing prompts yet; logging is
  manual from the Progress page.
- History and Settings tabs are not built, so the bottom nav has two entries.
- No PR/personal-best list yet, though `exercise_progress` holds the data.

## Change log

- Initial Progress screen, two views, streak rules, charts and bottom nav.
- Added `src/lib/dates.ts` and fixed the UTC-vs-local date bug in four places.
- Step 11 made streaks span blocks.
- **2026-09-13.** QA pass 2: "Best streak" pluralises its unit instead of always reading "sessions". See [17](17-qa-pass-2.md).
