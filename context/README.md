# Context specifications

One file per implementation step, recording **what was built and how**.

`SPEC.md` at the repo root is the agreed product definition — what Abhyas is
meant to do. These files are the implementation record: the actual file paths,
the decisions taken while building, the reasoning behind them, and what was
verified. They are written so someone with no memory of the original work can
pick the project up.

## Convention

- A file is created when a step is completed.
- When later work changes an area, **that area's file is updated** — not only
  the commit message. Each file ends with a change log.
- Every file follows the same shape: what it delivers, how it is implemented,
  decisions and why, what was verified, and known gaps.

## Steps

| # | Step | Status |
|---|---|---|
| [01](01-foundation-and-environment.md) | Foundation, tooling, deployment | Done |
| [02](02-database-schema-and-rls.md) | Database schema and row-level security | Done |
| [03](03-authentication.md) | Google authentication and route protection | Done |
| [04](04-onboarding.md) | Onboarding flow | Done |
| [05](05-exercise-catalogue.md) | Exercise catalogue | Done |
| [06](06-block-generator.md) | Block generator | Done |
| [07](07-guided-session.md) | Guided session with timers | Done |
| [08](08-progression.md) | Progression from logged sets | Done |
| [09](09-progress-charts-and-streaks.md) | Progress charts and streaks | Done |
| [10](10-settings-and-history.md) | Settings and history | Done |
| [11](11-block-rollover.md) | Block rollover | Done |
| [12](12-yoga-and-breathing.md) | Yoga and breathing runners | Done |
| [13](13-performance.md) | Navigation performance | Done |

## Live references

| | |
|---|---|
| Repo | https://github.com/Dhananjay2010/abhyas (private) |
| Production | https://abhyas-indol.vercel.app |
| Supabase project ref | `bjtjhnfyheruxldqbmrj` (region: Mumbai) |
