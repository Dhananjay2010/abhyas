# QA reproduction scripts

Standalone scripts backing the findings in `../../QA-FINDINGS.md`. They are not
part of `npm test`; run them directly.

| Script | Run | Shows |
|---|---|---|
| `adversarial.ts` | `npx tsx scripts/qa/adversarial.ts` | What the progression engine does with a default-tapped session, a stray 0-rep set, a negative weight and a 999-rep entry (H3, M1, M3). |
| `dates.ts` | `TZ=UTC npx tsx scripts/qa/dates.ts` then `TZ=America/New_York npx tsx scripts/qa/dates.ts` | That the week/deload calculation is correct under UTC and wrong under any other server timezone (L1). |

`H1` (the double-tap that loses a set) is reproduced in the browser: add a
delay to the stub in `src/app/dev/session/preview.tsx`

```ts
const ok = async () => { await new Promise(r => setTimeout(r, 800)); return { ok: true } as const; };
```

then at `/dev/session` walk to the training phase, tap "Log set 1", wait ~300 ms
and tap it again. The counter reads `2 of 7 sets logged`, the list shows only
set 1, and the next button is `Log set 3`. Revert the stub afterwards.
