# QA reproduction scripts

Standalone scripts backing `../../QA-FINDINGS.md`. Not part of `npm test`; run
them directly.

| Script | Run | Shows |
|---|---|---|
| `adversarial.ts` | `npx tsx scripts/qa/adversarial.ts` | What the progression engine does with a stray 0-rep set, a negative weight and a 999-rep entry — and, at the end, that those inputs can no longer be entered, and that a tapped-through session no longer earns a weight increase. |

The date arithmetic that used to shift with the server's timezone (L1) is now a
real regression test rather than a scratch script:

```bash
npm run test:dates
TZ=America/New_York npm run test:dates   # the offset that used to fail
```

`H1` — the double tap that lost a set — is fixed and its guard is best seen in
the browser. Add a delay to the stub in `src/app/dev/session/preview.tsx`:

```ts
const ok = async () => { await new Promise(r => setTimeout(r, 800)); return { ok: true } as const; };
```

then at `/dev/session` walk to the training phase, tap "Log set 1", wait ~300 ms
and tap again. The button reports `disabled` during the request, the counter
reads `1 of 7 sets logged`, and the next button is `Log set 2`. Before the fix
it read `2 of 7` and `Log set 3`. Revert the stub afterwards.
