# 12 — Yoga and breathing runners

## What this delivers

The two tracks that previously had no session experience: a Yoga with Adriene
player backed by 200 verified videos, and a breathing pacer for the meditation
track. Both write a completed session, so they count towards streaks and appear
in history exactly like a strength workout.

## Files

| File | Role |
|---|---|
| `supabase/migrations/20260909095900_yoga_video_unique.sql` | Uniqueness for idempotent re-seeding |
| `supabase/migrations/20260909100000_seed_yoga.sql` | 9 playlists, 200 videos (generated) |
| `src/app/yoga/*` | Page, player, `markYogaVideoDone` |
| `src/app/breathe/*` | Page, pacer, `completeBreathingSession` |
| `src/app/dev/yoga`, `src/app/dev/breathe` | Development-only harnesses |

## Yoga content, and how it was verified

Nine playlists, 200 videos. **Every id was verified against YouTube before
being written into a migration**, because a fabricated id renders a dead player
the user cannot recover from.

The method: fetch the channel's playlists page, extract ids from YouTube's own
`ytInitialData`, then check each id through the **oEmbed endpoint**
(`youtube.com/oembed?url=…`). A 200 there means the resource exists *and*
permits embedding; anything else means it would fail in the app.

- 30 playlist ids extracted, **29 verified** — the one rejection
  (`PLeP104lrr650`) was a malformed short id, which confirms the check is
  meaningful rather than always passing.
- 200 video ids checked, **200 returned 200**, zero failures.

Seeded content: HOME, BREATH, MOVE, CENTER and FLOW (30-day journeys), Prana
(7-day), plus Yoga for Mobility, Restorative Yoga and Yoga for Neck Tension —
the last three chosen because they pair well with strength training.

Note the page structure: YouTube no longer uses `playlistVideoRenderer`. The
current markup is `lockupViewModel`, carrying `contentId`, the title and a
duration. A scraper written against the old shape silently returns zero rows.

### Legal posture

Videos are **embedded, never re-hosted**, via `youtube-nocookie.com`. Every
screen credits Yoga with Adriene and links to her channel, and states that
Abhyas neither hosts nor modifies the content. See `SPEC.md` section 9.3.

An "Open on YouTube" link sits under the player **always**, not conditionally:
a video can be removed or have embedding revoked at any time, and an iframe
gives no reliable cross-origin way to detect that. The link points at the video
currently selected — a fallback aimed at the wrong video would be worse than
none.

### Completion is self-reported

There is no way to know whether an embedded video was watched, and the UI says
so: "We cannot tell whether a video was watched, so this is on your word."
Marking one done appends to `user_yoga_progress.completed_video_ids` and writes
a completed session for the day.

## Breathing pacer

The six seeded patterns, with a circle that grows on the inhale, shrinks on the
exhale and holds still during a hold, so the shape itself carries the
instruction. Zero-length phases are skipped, so 4-7-8 correctly runs
inhale → hold → exhale with no trailing hold.

Two patterns are special-cased by slug: Nadi Shodhana shows an alternating
left/right nostril label, and the physiological sigh reminds you the inhale is
a double. Cycle count is adjustable, seeded from the pattern default and the
user's `meditation_default_minutes`.

## Two bugs that only running it could find

Both were invisible to typecheck and lint, and neither would have been caught
by a unit test of the logic.

**1. The pacer never advanced.** `phasesOf()` builds fresh objects, so `phase`
was a new reference on every render. The pacer effect depended on it, tore down
and re-ran continuously, and reset `phaseEndsAt` before the countdown could
reach zero. The timer sat frozen at the first phase. Fixed by memoising
`phases` on `selected`.

**2. Every cycle counted twice.** `advance()` called `setCycleDone` from
*inside* the `setPhaseIndex` updater. React invokes updaters twice in
development to surface exactly that impurity, so the counter ran 1 → 3 → 5 → 7
and, because the nostril side is `cycleDone % 2`, Nadi Shodhana was permanently
stuck on "Left". Fixed by tracking the phase index in a ref so `advance` can
tell whether it wrapped without reading state inside an updater.

The second is worth remembering: it would have behaved *differently in
production*, where updaters are not double-invoked — a bug that only reproduces
in development is still a real defect in the code.

## Verification performed

- **Content:** 200/200 video ids and 29/30 playlist ids verified via oEmbed.
  Row counts confirmed after seeding, with day numbering intact (HOME max day
  30, Prana max day 8).
- **Yoga player, in a harness with real ids:** the embed genuinely loads;
  selecting a different video swaps the player; the "Open on YouTube" link
  resolves to the same video that is playing; the channel attribution is
  present; the player uses `youtube-nocookie.com`.
- **Breathing pacer:** a full Box Breathing run cycles
  in → hold → out → hold to completion; 4-7-8 skips the trailing hold; Nadi
  Shodhana alternates Left → Right → Left → Right across cycles 1–4.

## Bug: yoga and breathing were unreachable on a training day

Today linked to them only on rest and yoga days, and neither is in the bottom
nav, so on a training day there was no way to open either without typing the
URL. Today now carries an "Anytime" row on every day type.

Breathing cycle counts derived from the user's preferred minutes also landed on
awkward numbers (55 cycles, "10:05"); they are rounded to the nearest five.

## Known gaps

- **Neither runner has been used on a real account.** The harnesses stub
  persistence, so `markYogaVideoDone` and `completeBreathingSession` have never
  actually written a row.
- Video ids are verified at seed time only. If Adriene removes a video the app
  will not know until someone hits it and uses the fallback link; there is no
  periodic re-check.
- Durations come from the playlist page, so a video re-uploaded at a different
  length would show a stale figure.
- The yoga player does not resume mid-video or track partial progress.
- Per-pattern breathing timings are not yet user-editable, though `SPEC.md`
  section 9.4 calls for it; only the cycle count is adjustable.
- Yoga sessions are not attached to a `program_day`, so on a rest day a yoga
  session is recorded as an extra rather than replacing anything.

## Change log

- Initial yoga player and breathing pacer, 200 verified videos seeded.
