# Abhyas — Fitness Tracking App

**Abhyas** (अभ्यास) — *practice; repetition*. A mobile-first web app that tells you exactly what to do for your workout every single day, guides you through it with timers, and records what you did so it can make next week harder than this week.

One hour a day. No guesswork.

---

## Quick Links

- **Live:** https://abhyas-indol.vercel.app
- **Docs:** [SPEC.md](SPEC.md) (product spec) | [context/](context/README.md) (implementation notes)
- **Supabase:** `brldynuhozaszaduwfse` (ap-south-1, Mumbai)

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 4
- **Database & Auth:** Supabase (Postgres + Auth)
- **Hosting:** Vercel (region: `bom1`, Mumbai)
- **Node:** 22.x (see `.nvmrc`)

---

## Prerequisites

- **Node.js 22 or later** (pinned in `.nvmrc`)
- **npm** (comes with Node)
- **Supabase CLI** (for running migrations): `npm install -g supabase`
- **nvm** (recommended, for managing Node versions): https://github.com/nvm-sh/nvm

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Supabase configuration (get these from Supabase dashboard > Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

**Where to find these:**
1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **API**
3. Copy the **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
4. Copy the **anon/public** key → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Note:** Both values are publishable and safe to commit to preview environments. The service role key is **never** used in the application.

### 3. Run database migrations

The database schema is managed with Supabase migrations in `supabase/migrations/`.

**Option A: Against the live Supabase project**

```bash
# Link to the Supabase project (one-time setup)
npx supabase link --project-ref <your-project-ref>

# Push all migrations
npx supabase db push
```

**Option B: Local Supabase instance (for development)**

```bash
# Start Supabase locally (Docker required)
npx supabase start

# Migrations are applied automatically
# The local URL and keys will be printed; update .env.local to use them
```

### 4. Start the development server

**Important:** Use `npm run dev:nvm`, not `npm run dev`.

The plain `npm run dev` command will fail on systems where the global Node version is not 22.x. The `dev:nvm` script runs `scripts/dev.sh`, which sources nvm, sets the correct Node version from `.nvmrc`, and starts the dev server.

```bash
npm run dev:nvm
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Why not `npm run dev`?** Next.js 16 with Turbopack spawns child processes that resolve `node` from `PATH`, so the Node version must be set in the shell's `PATH` itself, not just the parent process. `dev:nvm` handles this automatically.

---

## Testing

The project uses custom test scripts (not Jest or Vitest) for deterministic unit tests of core logic:

```bash
# Run all tests
npm test

# Run individual test suites
npm run test:generator    # Block generation logic
npm run test:progression  # Progression and working weight calculation
npm run test:streaks      # Streak computation
npm run test:dates        # Date handling and timezone logic
npm run test:breathing    # Breathing pattern validation
npm run test:branding     # Branding config and PWA manifest
```

All tests must pass before deployment.

---

## Linting & Type Checking

```bash
# Run ESLint
npm run lint

# Run TypeScript type checking
npx tsc --noEmit
```

Both must pass cleanly for production builds.

---

## Building for Production

```bash
npm run build
```

This runs Next.js's production build. The build output is optimized and ready to deploy.

**Note:** The production build generates static assets and server functions. Vercel handles deployment automatically on push to `main`.

---

## Deploying to Vercel

Deployment is automatic via GitHub integration:

1. **Push to `main`** → production deployment at https://abhyas-indol.vercel.app
2. **Push to any branch** → preview deployment at `abhyas-<branch>-<hash>.vercel.app`

### Manual deployment (if needed)

```bash
# Install Vercel CLI (one-time)
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Vercel configuration

The project pins the serverless region to **`bom1` (Mumbai)** in `vercel.json` to co-locate with the Supabase database in `ap-south-1`. This keeps latency low for all database queries.

**Never change the region without also migrating the database.** See `context/01-foundation-and-environment.md` for details on the latency trade-off.

---

## PWA Features

Abhyas is a Progressive Web App (PWA) and can be installed on mobile devices:

- **App manifest:** `src/app/manifest.ts` (generated at `/manifest.webmanifest`)
- **Service worker:** `public/sw.js` (offline fallback)
- **Icons:** Generated from `public/icon-source.svg` using `npm run generate-icons`
- **Branding config:** `src/lib/branding.ts` (centralized names, colors, icon paths)

### Regenerating PWA icons

If you update `public/icon-source.svg` or need to regenerate icons:

```bash
npm run generate-icons
```

This creates all required icon sizes (192×192, 512×512, maskable variants, apple-touch-icon, favicon) in `public/icons/`.

**For white-label deployments:** Replace `icon-source.svg` with your gym's logo and run `npm run generate-icons` to generate branded icons.

---

## Project Structure

```
src/
├── app/              # Next.js App Router pages and routes
│   ├── today/        # Today's workout
│   ├── breathe/      # Breathing practices
│   ├── history/      # Session history
│   ├── progress/     # Charts and metrics
│   ├── settings/     # User settings
│   ├── session/      # Guided session runner
│   ├── onboarding/   # First-run onboarding
│   └── layout.tsx    # Root layout (metadata, nav)
├── components/       # Shared UI components
├── lib/              # Core logic (no UI)
│   ├── supabase/     # Supabase clients (browser, server, auth)
│   ├── program/      # Block generation, splits, progression
│   ├── breathing/    # Breathing engine, audio, patterns
│   ├── progress/     # Streaks, charts, stats
│   ├── session/      # Session validation, device utils
│   ├── branding.ts   # Centralized branding config (PWA)
│   └── dates.ts      # Timezone-aware date handling
├── proxy.ts          # Next 16 request proxy (session refresh, route guard)

scripts/
├── dev.sh            # Dev server wrapper (sources nvm, runs next dev)
├── generate-icons.js # PWA icon generation from SVG
├── test-*.ts         # Test suites (generator, progression, etc.)

supabase/
├── migrations/       # Database schema and seed data
├── config.toml       # Auth config (redirect URLs, providers)

public/
├── icon-source.svg   # Source icon for PWA (regenerate with generate-icons)
├── icons/            # Generated PWA icons (committed)
├── sw.js             # Service worker (offline fallback)
```

---

## Key Concepts

- **Block:** A 4-week training cycle. Weeks 1–3 progress, week 4 deloads.
- **Track:** The kind of training (weights, bodyweight, yoga, breathing).
- **Session:** One day's workout, planned or performed.
- **Progression:** Double progression—stay at a weight until you hit the top of the rep range on every set, then add the smallest increment.
- **Planning mode:** `progression` (default, tracks working weights) or `daily_menu` (fresh plan each day, no memory).

See [SPEC.md](SPEC.md) for the full product specification.

---

## Troubleshooting

### Dev server won't start

- **Check Node version:** `node -v` should be 22.x. Run `nvm use` to switch.
- **Use `npm run dev:nvm`**, not `npm run dev` (see [Local Setup](#4-start-the-development-server)).
- **Check Turbopack errors:** If you see `replaceAll is not a function`, you're on an old Node version.

### Database connection fails

- **Check `.env.local`:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly.
- **Check Supabase project status:** Free-tier projects pause after 7 days of inactivity. Wake it up from the Supabase dashboard.
- **Run migrations:** If tables are missing, run `npx supabase db push`.

### Build fails with TypeScript errors

- **Run `npx tsc --noEmit`** to see type errors.
- **Check imports:** Ensure all imports use `@/` aliases (e.g. `@/lib/branding`, not `../lib/branding`).

### Service worker isn't registering

- **Service workers only work over HTTPS or localhost.** Check your deployment URL.
- **Service workers are disabled in development** (`NODE_ENV === 'development'`). Test in production or with `npm run build && npm start`.

---

## Known Limitations

- **Free-tier Supabase:** Projects pause after ~7 days of inactivity and are capped at 500 MB. Upgrade to a paid plan before real users.
- **Google OAuth only:** Email/password and magic links require a domain + SMTP provider (deferred to v1.1).
- **No offline data sync:** The service worker provides a basic offline fallback page, but sessions require a network connection. Authenticated API calls (Supabase) are never cached.

---

## Contributing

This is a private project. For questions or issues, contact the repo owner.

---

## License

Private. Not open source.

