# 03 — Authentication and route protection

## What this delivers

Google sign-in, session refresh, and a guard that keeps signed-out visitors out
of the application routes.

## Files

| File | Role |
|---|---|
| `src/lib/supabase/client.ts` | Browser client, typed against `Database` |
| `src/lib/supabase/server.ts` | Server client for components and route handlers |
| `src/lib/supabase/session.ts` | Session refresh + public-path guard |
| `src/proxy.ts` | Next 16 proxy entry point (formerly `middleware.ts`) |
| `src/app/auth/callback/route.ts` | Exchanges the OAuth code for a session |
| `src/app/auth/signout/route.ts` | POST-only sign out |
| `src/app/sign-in-button.tsx` | Google button; surfaces errors on screen |

## Decisions and why

### Google only, for now

Email/password and magic links both need to send mail, and Supabase's built-in
mailer is rate-limited to a handful per hour and explicitly not for production.
Adding them means a domain and an SMTP provider, so they are deferred.

The **Email provider is disabled** in Supabase, not merely hidden in the UI —
otherwise the API would still accept signups that could never be confirmed.

### Auth URL configuration lives in `supabase/config.toml`

Not clicked into the dashboard. It is version-controlled and reviewable:

```
site_url = "https://abhyas-indol.vercel.app"
additional_redirect_urls = [
  "http://localhost:3000/**",
  "https://abhyas-indol.vercel.app/**",
  "https://abhyas-*-dhananjays-projects-6717e849.vercel.app/**",
]
```

The wildcard entry covers Vercel preview deployments.

**The failure mode to know about:** when `redirect_to` is not in the allowlist,
Supabase does **not** error — it silently falls back to `site_url`. The symptom
is signing in on production and landing back on `localhost:3000`. Testing the
`/auth/v1/authorize` endpoint cannot detect this, because the handoff to Google
succeeds either way.

Change this config with `supabase config pull` → edit → `supabase config diff`
→ `supabase config push`. Always run the diff first: a pull writes defaults for
undeclared settings, and pushing them can change things you did not intend.
Comment out any block you do not want pushed. The Google client secret is not
managed by `config push` and is left untouched.

### Google Cloud needs no per-domain configuration

Supabase always sends Google the same `redirect_uri` —
`https://<ref>.supabase.co/auth/v1/callback` — regardless of where the user
came from. Authorized JavaScript origins only matter for Google's One Tap SDK,
which is not used. **Adding new app domains requires a Supabase change only.**

### Route protection is a deny-list of public paths

`session.ts` holds `PUBLIC_PATHS = ["/", "/auth", "/legal"]`; anything else
redirects to `/` without a session. Development-only paths (`/dev`) are added
to that list only when `NODE_ENV === "development"`, and the pages themselves
also call `notFound()` outside development — two independent gates.

`supabase.auth.getUser()` must be called in the proxy on every request; that
call is what refreshes the token.

## Verification performed

- Providers endpoint confirms `google: true`, `email: false`, signups open.
- Both localhost and production redirect targets accepted by `/auth/v1/authorize`.
- `/today`, `/onboarding` and `/dev/onboarding` all 307 to `/` when signed out,
  on localhost and in production.
- End-to-end Google sign-in confirmed working by Dhananjay on a real device.
  **This leg cannot be verified from here** — it needs his Google credentials.

## Known gaps

- Email and magic-link sign-in deferred; needs a domain plus an SMTP provider.
- No account deletion flow yet (deleting the auth user cascades correctly, but
  nothing in the UI triggers it).

## Change log

- Google OAuth, proxy session refresh, callback and signout routes.
- Fixed production sign-in landing on localhost by adding the deployed URL to
  the Supabase redirect allowlist and moving that config into `config.toml`.
- Temporarily allowed a LAN origin for on-device testing; removed once Vercel
  deployments were working again.
- **2026-09-13.** The auth callback now calls `ensureProfileRows()` after a successful code exchange, creating `profiles` and `user_settings` if they are missing. The `on_auth_user_created` trigger remains the primary mechanism; this is the backstop, added after that trigger was lost in the region move and every new signup for three days landed on a blank page. Today self-heals the same way and renders a readable message rather than throwing. See [QA-FINDINGS-2.md](../QA-FINDINGS-2.md).
