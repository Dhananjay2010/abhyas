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

## Development and Test Environments

Abhyas uses **local Supabase** for development and testing, keeping all development work isolated from production:

- **Local Supabase** (via Supabase CLI) — for development and testing on your machine
- **Production Supabase** — the live database (`brldynuhozaszaduwfse`, Mumbai)

**Golden rule:** Developers use local Supabase only. Migrations reach production only through the release process (applied by the project owner's coordinator after merge), never through dev scripts or direct database access.

---

### Local Supabase Setup

The **Supabase CLI** runs a complete Supabase stack locally (Postgres, Auth, Storage, Studio) in Docker containers. All migrations apply automatically, and you get a fresh database that matches production's schema.

#### Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose)
- **Supabase CLI** (install globally):

```bash
npm install -g supabase
```

Verify installation:

```bash
supabase --version
# Should print: supabase 1.x.x or later
```

#### Start Local Supabase

```bash
npm run supabase:start
```

This command:
- Starts Docker containers for Postgres, Auth, Storage, Studio, and more
- Applies all migrations from `supabase/migrations/` to a fresh local database
- Seeds the database with test data from `supabase/seed.sql`
- Prints local URLs and API keys

**Sample output:**

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbG...your-local-anon-key...
service_role key: eyJhbG...your-local-service-role-key...
   S3 Access Key: 625729a08b95bf1b7ff351a663f...
   S3 Secret Key: 850181e4652dd023b7a98c58ae0...
       S3 Region: local
```

**Copy the `anon key`** and **`API URL`** to your `.env.local`:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...your-local-anon-key...
```

Now run the dev server:

```bash
npm run dev:nvm
```

Your app connects to the **local Supabase instance**, not production.

#### Exploring the Local Database

Open **Supabase Studio** (the local dashboard) at [http://127.0.0.1:54323](http://127.0.0.1:54323).

You can:
- Browse tables and data (Table Editor)
- Run SQL queries (SQL Editor)
- View auth users (Authentication)
- Test storage buckets (Storage)

#### Resetting the Local Database

To wipe the local database and re-apply all migrations + seed data:

```bash
npm run supabase:reset
```

This is useful when:
- You want to start fresh
- You've added new migrations and want to verify they apply cleanly
- The local database is in a bad state

**Warning:** This deletes all local data. It does not touch production.

#### Stopping Local Supabase

```bash
npm run supabase:stop
```

Docker containers are stopped but not deleted. Your data persists until you run `supabase:reset`.

#### Checking Status

```bash
npm run supabase:status
```

Prints the status of all local services (running, stopped, or not started).

---

### Test Data (Seed File)

The local database is seeded with deterministic test data from `supabase/seed.sql`:

- **Test user profile:** "Test User" (UUID: `00000000-0000-0000-0000-000000000001`)
- **Equipment:** Home gym setup (barbell, dumbbells, bench, pull-up bar)
- **Program:** 4-day Upper/Lower split, block 1, week 3
- **Session history:** One completed workout from 2 days ago
- **Exercise progress:** Working weights for key lifts (bench: 60kg, squat: 80kg, deadlift: 100kg)
- **Body metrics:** Weekly weigh-ins

**Using the test data:**

1. Start local Supabase: `npm run supabase:start`
2. The seed runs automatically and creates a test user in the local database
   - Email: `test@example.com`
   - Password: `testpass123`
   - UUID: `00000000-0000-0000-0000-000000000001`

**⚠️ Important:** The app's UI only offers **Google OAuth sign-in** (no email/password form). The seeded user **cannot sign in through the app UI as-is**. To use the seeded test data locally:

**Option 1: Sign in programmatically with the seeded user (for testing without Google)**

The email provider is enabled in local Supabase, but there's no password form in the app UI. You can get a session programmatically using supabase-js:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://127.0.0.1:54321',
  'your-local-anon-key'  // From `npm run supabase:start` output
)

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'testpass123'
})
```

This gives you a valid session for the seeded user without adding login UI to the app.

**Option 2: Sign in with Google and create your own data**

Configure Google OAuth in `supabase/config.toml` under `[auth.external.google]` with local redirect URLs, then sign in through the app's Google sign-in button. Use your own account and create data through the app's normal onboarding and workout flows. The seeded test user is for programmatic and server-side testing (Options 1 and 3).

**Option 3: Use the seeded user programmatically**

Access the local database directly (via Studio SQL Editor at http://127.0.0.1:54323 or psql) to query/modify the seeded user's data for testing server-side logic, migrations, or database queries without needing to sign in.

The seed data is **clearly fake** (display name "Test User", birthdate 1990-01-01, test@example.com) and safe to commit. The password `testpass123` is a local-only test credential.

---

### Running Tests

All tests in this project are **deterministic unit tests** that do not require a database connection. They test core logic (block generation, progression, streaks, etc.) with mocked data.

```bash
npm test
```

**Tests do not connect to Supabase** (local or production). If you want to add integration tests in the future, start local Supabase first, set the local env vars, and write tests that connect to the local database.

---

### Migration Safety

When adding or modifying migrations:

1. **Never edit existing migration files.** If a schema change is needed, create a **new migration file**:

   ```bash
   npx supabase migration new <description>
   ```

   This creates a new file: `supabase/migrations/<timestamp>_<description>.sql`

2. **Test locally first:**

   ```bash
   npm run supabase:reset  # Apply all migrations to a fresh local DB
   ```

   If migrations fail, fix the SQL before committing.

3. **Production migrations:** After a PR is merged to `main`, the project owner's coordinator applies migrations to production through the release process. **Never apply migrations to production manually or via scripts.** Developers use local Supabase only.

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

