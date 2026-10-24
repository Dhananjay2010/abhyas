# White-Label Theming Guide

This document explains how to customize Abhyas for per-gym white-label deployments. Each gym can configure its own brand identity (name, colors, logo, domain, timezone) without modifying code.

## Quick Start

1. **Set the brand environment variable** in your deployment:
   ```bash
   NEXT_PUBLIC_BRAND=your-gym-id
   ```

2. **Define your brand** in `src/lib/branding.ts`:
   ```typescript
   const yourGym: Brand = {
     id: "your-gym-id",
     name: "Your Gym Name",
     shortName: "YourGym", // Max 12 chars for home screen
     description: "Your gym's one-sentence pitch",
     siteUrl: "https://yourgym.com",
     timezone: "America/New_York", // Optional, IANA timezone name
     defaultUnits: "metric", // 'metric' or 'imperial'
     colors: {
       accent: "#3b82f6",       // Primary action color
       accentHover: "#2563eb",  // Hover state
       accentFg: "#ffffff",     // Text on accent background
       bg: "#0a0a0a",           // Page background
       surface: "#1a1a1a",      // Cards, panels
       surface2: "#262626",     // Secondary surfaces
       border: "#404040",       // Border color
       fg: "#fafafa",           // Primary text
       muted: "#a3a3a3",        // Secondary text
       success: "#22c55e",      // Success states
       danger: "#ef4444",       // Error states
       chart: "#f97316",        // Chart data color
     },
     icons: {
       icon192: "/icons/icon-192.png",
       icon512: "/icons/icon-512.png",
       maskable192: "/icons/icon-192-maskable.png",
       maskable512: "/icons/icon-512-maskable.png",
       appleTouchIcon: "/icons/apple-touch-icon.png",
       favicon: "/favicon.ico",
     },
   };
   ```

3. **Add your brand to the registry**:
   ```typescript
   const brands: Record<string, Brand> = {
     default: abhyas,
     example,
     "your-gym-id": yourGym, // Add here
   };
   ```

4. **Replace icon files** in `/public/icons/` with your gym's branded icons (keep the same filenames).

5. **Deploy** with `NEXT_PUBLIC_BRAND=your-gym-id` set.

## Brand Configuration

### Required Fields

- **`id`** (string): Unique identifier matching `NEXT_PUBLIC_BRAND`
- **`name`** (string): Full application name (shown in title, manifest, Open Graph)
- **`shortName`** (string): Short name for home screen after PWA install (max 12 chars recommended)
- **`description`** (string): One-sentence description (shown in manifest, Open Graph)
- **`siteUrl`** (string): Canonical site URL (used for `metadataBase`, Open Graph, manifest scope)

### Optional Fields

- **`timezone`** (string): IANA timezone name (e.g., `"America/New_York"`)
  - Used as the default timezone for users when browser detection fails or during SSR
  - If not set, falls back to browser-detected timezone or `"Asia/Kolkata"`
  - Must be a [valid IANA timezone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

- **`defaultUnits`** (`"metric"` | `"imperial"`): Default unit system for new members
  - New members start with this unit preference (kg/cm for metric, lb/in for imperial)
  - Users can change their unit preference later in Settings
  - Examples: `"metric"` (default), `"imperial"`

### Colors

All colors must be **6-digit hex codes** (`#RRGGBB`):

| Color | Purpose | Example |
|-------|---------|---------|
| `accent` | Primary brand color, CTAs, active states | `#ff9a2e` |
| `accentHover` | Accent hover state (slightly darker/more saturated) | `#e8850c` |
| `accentFg` | Text color on accent background (ensure contrast) | `#1a1000` |
| `bg` | Page background | `#0a0c0e` |
| `surface` | Elevated surfaces (cards, modals) | `#151a1f` |
| `surface2` | Secondary surfaces (inputs, nested cards) | `#1d242b` |
| `border` | Border color | `#2a333c` |
| `fg` | Primary text color | `#ecf1f6` |
| `muted` | Secondary/muted text | `#93a1ae` |
| `success` | Success messages, confirmations | `#4ade80` |
| `danger` | Error messages, destructive actions | `#f87171` |
| `chart` | Chart data visualization (validate contrast against `surface`) | `#d95926` |

**Color Guidelines:**
- Ensure sufficient contrast between `fg` and `bg` (WCAG AA: 4.5:1 for normal text)
- Ensure sufficient contrast between `accentFg` and `accent`
- `chart` should contrast well against `surface` (where charts are typically rendered)
- Keep colors consistent with your gym's brand identity

### Icons

Replace the icon files in `/public/icons/` with your own:

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192×192 | Standard icon (Android, PWA install prompt) |
| `icon-512.png` | 512×512 | High-DPI icon (splash screen) |
| `icon-192-maskable.png` | 192×192 | Maskable icon with 20% safe zone (Android adaptive icons) |
| `icon-512-maskable.png` | 512×512 | Maskable icon with 20% safe zone |
| `apple-touch-icon.png` | 180×180 | iOS home screen icon |
| `favicon.ico` | 32×32 | Browser favicon (PNG format) |

**Icon Guidelines:**
- Use **transparent backgrounds** for standard icons
- Use **solid backgrounds matching `colors.bg`** for maskable icons
- Keep **20% safe zone** on all sides for maskable icons (content in center 80%)
- Test maskable icons with the [Maskable.app tool](https://maskable.app/)

To regenerate icons from an updated `icon-source.svg`:
```bash
npm run generate-icons
```

## Timezone Configuration

Each gym can set its local timezone, which is used as the default for session scheduling, "today" determination, and date displays when the user's browser timezone cannot be detected.

### How Timezone Resolution Works

**Priority order:**
1. **User's profile timezone** (if set in `profiles.timezone`)
2. **Gym's brand timezone** (from `branding.timezone`)
3. **User's browser timezone** (detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`)
4. **Fallback:** `"Asia/Kolkata"`

### Setting a Gym's Timezone

Add a `timezone` field to your brand definition:

```typescript
const yourGym: Brand = {
  id: "your-gym-id",
  name: "FitCore Gym",
  timezone: "America/New_York", // Add this
  // ... rest of config
};
```

**Valid timezone names:**
- Must be [IANA timezone names](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
- Examples: `"America/New_York"`, `"Europe/London"`, `"Asia/Tokyo"`, `"Australia/Sydney"`
- Use full names, not abbreviations (`"America/New_York"`, not `"EST"`)

### SSR and Hydration

The timezone resolution is SSR-safe:
- **Server:** Uses gym timezone or `"Asia/Kolkata"` (browser detection unavailable)
- **Client:** Uses browser-detected timezone if available

Components that display timezone-sensitive dates should use `suppressHydrationWarning` if they need to show the browser-detected time immediately:

```tsx
<time suppressHydrationWarning>
  {formatInTimezone(date, resolveTimezone())}
</time>
```

### Timezone Helpers

Import from `src/lib/timezone.ts`:

```typescript
import {
  resolveTimezone,
  resolveTimezoneWithProfile,
  getDefaultTimezone,
  detectBrowserTimezone,
  formatInTimezone,
} from "@/lib/timezone";

// Get effective timezone (gym > browser > fallback)
const tz = resolveTimezone();

// Get timezone with user profile priority
const tz = resolveTimezoneWithProfile(profile.timezone);

// Get gym's default timezone
const defaultTz = getDefaultTimezone();

// Detect browser timezone (client-side only)
const browserTz = detectBrowserTimezone(); // null on server

// Format a date in a specific timezone
const formatted = formatInTimezone(
  new Date(),
  "America/New_York",
  { dateStyle: "medium", timeStyle: "short" }
);
```

## How Theming Works

### CSS Variables

Brand colors are injected as CSS variables at runtime via the `BrandThemeInjector` component in `src/app/layout.tsx`. This allows Tailwind classes to reference semantic color names:

```tsx
// Component using brand colors via Tailwind
<button className="bg-accent hover:bg-accent-hover text-accent-fg">
  Start Workout
</button>

// Compiled to:
<button style="background: var(--color-accent); ...">
  Start Workout
</button>
```

### Tailwind Configuration

Colors are defined in `src/app/globals.css` as CSS variables:

```css
@theme {
  --color-accent: #ff9a2e;
  --color-accent-hover: #e8850c;
  /* ... */
}
```

These are **fallback values**. The `BrandThemeInjector` overrides them with the active brand's colors at runtime.

### Available Color Classes

Use these Tailwind utility classes in components:

| Class | CSS Variable | Purpose |
|-------|-------------|---------|
| `bg-accent` | `--color-accent` | Accent background |
| `bg-accent-hover` | `--color-accent-hover` | Accent hover state |
| `text-accent-fg` | `--color-accent-fg` | Text on accent background |
| `bg-bg` | `--color-bg` | Page background |
| `bg-surface` | `--color-surface` | Card/panel background |
| `bg-surface-2` | `--color-surface-2` | Secondary surface |
| `border-border` | `--color-border` | Border color |
| `text-fg` | `--color-fg` | Primary text |
| `text-muted` | `--color-muted` | Secondary text |
| `text-success` | `--color-success` | Success text |
| `text-danger` | `--color-danger` | Error text |
| `text-chart` | `--color-chart` | Chart data color |

**Do not use hard-coded hex colors** in components. Always use the semantic color classes so colors can be customized per gym.

### Metadata and Manifest

The following automatically use the active brand:

- **Page title:** `<title>{branding.name}</title>`
- **Meta description:** `<meta name="description" content="{branding.description}" />`
- **PWA manifest:** Name, short name, description, colors, icons
- **Open Graph:** Site name, title, description, URL
- **Theme color:** Browser UI tinting
- **Icons:** All PWA and favicon references

## Testing

### Running Tests

```bash
# Test all branding configuration and timezone resolution
npm run test:branding

# Test specific aspects (included in npm test)
npm test
```

### Test Coverage

The branding tests verify:
- ✅ Brand selection via `NEXT_PUBLIC_BRAND`
- ✅ Fallback to `default` when brand not found
- ✅ All required fields present and valid
- ✅ All colors are valid 6-digit hex codes
- ✅ Timezone is valid IANA name (if set)
- ✅ Timezone resolution (config > browser > fallback)
- ✅ CSS variable generation includes all colors
- ✅ Icon paths are absolute and start with `/`
- ✅ Manifest reads from branding config
- ✅ Manifest colors and icons match brand
- ✅ Site URL is valid

### Manual Testing Checklist

When adding a new brand:

1. **Build succeeds:** `npm run build`
2. **Tests pass:** `npm run test:branding`
3. **Icon paths exist:** Check that all icon files are present in `/public/icons/`
4. **Colors render correctly:** Check primary actions, backgrounds, text contrast
5. **PWA manifest:** Visit `/manifest.webmanifest` and verify all fields
6. **Metadata:** View page source and check `<title>`, `<meta>` tags, Open Graph
7. **Theme color:** Check browser UI tints to the configured color
8. **Timezone:** Verify "today" and session times use correct timezone

## Example: Adding a New Gym

Let's add "PowerHouse Gym" as a white-label deployment:

### 1. Define the brand

Edit `src/lib/branding.ts`:

```typescript
const powerhouse: Brand = {
  id: "powerhouse",
  name: "PowerHouse Gym",
  shortName: "PowerHouse",
  description: "Science-backed training programs that build real strength.",
  siteUrl: "https://powerhousegym.com",
  timezone: "America/Los_Angeles",
  defaultUnits: "imperial", // US gym, use imperial units
  colors: {
    accent: "#dc2626",      // Bold red
    accentHover: "#b91c1c",
    accentFg: "#ffffff",
    bg: "#0c0a09",          // Near-black
    surface: "#1c1917",     // Dark gray
    surface2: "#292524",
    border: "#44403c",
    fg: "#fafaf9",
    muted: "#a8a29e",
    success: "#22c55e",
    danger: "#ef4444",
    chart: "#f97316",
  },
  icons: {
    icon192: "/icons/icon-192.png",
    icon512: "/icons/icon-512.png",
    maskable192: "/icons/icon-192-maskable.png",
    maskable512: "/icons/icon-512-maskable.png",
    appleTouchIcon: "/icons/apple-touch-icon.png",
    favicon: "/favicon.ico",
  },
};

const brands: Record<string, Brand> = {
  default: abhyas,
  example,
  powerhouse, // Add here
};
```

### 2. Replace icons

Replace files in `/public/icons/` with PowerHouse-branded icons (keep the same filenames and sizes).

### 3. Test locally

```bash
# Set the brand and run dev server
NEXT_PUBLIC_BRAND=powerhouse npm run dev

# Run tests
npm run test:branding
```

### 4. Deploy

Configure your hosting platform (Vercel, Netlify, etc.) with:

```bash
NEXT_PUBLIC_BRAND=powerhouse
```

Deploy as normal. The build will validate the brand configuration and fail if any required fields are missing or invalid.

## Architecture Notes

### Why Environment Variables?

`NEXT_PUBLIC_BRAND` is a build-time environment variable (not runtime) so:
- Brand selection happens once at build time, not on every request
- No runtime overhead for brand resolution
- Next.js can optimize and tree-shake unused brands
- Clear separation between development (default) and production deployments

### Why Not Database-Driven?

Each gym deployment is a **separate app instance** with its own:
- Domain (e.g., `powerhouse.com` vs `fitcore.com`)
- Database (Supabase project per gym)
- Icons and assets
- Build configuration

A single codebase with database-driven branding would require:
- One shared database for all gyms (privacy/security issue)
- Runtime brand resolution on every request (performance overhead)
- Complex domain-to-brand mapping
- Shared icons/assets or runtime asset resolution

The current approach keeps deployments isolated, performant, and secure.

### File Ownership

**Allowed to modify** (not controlled by PR #1 or other developers):
- `src/lib/branding.ts` — Add brands, modify colors
- `src/lib/timezone.ts` — Timezone helpers
- `src/app/globals.css` — CSS variables (fallback values)
- `src/components/brand-theme-injector.tsx` — CSS injection logic
- `src/app/layout.tsx` — Metadata and theme color
- `src/app/manifest.ts` — PWA manifest
- `src/app/offline/page.tsx` — Offline fallback page
- `public/icons/*` — Icon files
- `docs/white-label.md` — This documentation

**Do NOT modify** (controlled by PR #1 or other work):
- `src/lib/program/generate.ts` — Program generator
- `src/app/today/page.tsx` — Today page logic
- `src/app/settings/*` — Settings logic
- `src/lib/dates.ts` — Date utilities (if PR #1 depends on current behavior)

### Follow-Up: Remaining Hard-Coded Timezones

The following files still contain `"Asia/Kolkata"` fallbacks and are **owned by PR #1** or other work. They should adopt `resolveTimezoneWithProfile()` from `src/lib/timezone.ts` later:

**Server components and actions** (can adopt immediately after PR #1 merges):
- `src/app/today/page.tsx:92` — Today page timezone resolution
- `src/app/progress/actions.ts:27` — Body weight logging
- `src/app/session/actions.ts:103, 860` — Session actions
- `src/app/breathe/actions.ts:51, 118` — Breathing session actions
- `src/app/yoga/actions.ts:35` — Yoga session actions
- `src/app/onboarding/actions.ts:67` — Onboarding flow
- `src/lib/program/persist.ts:165` — Program generation

**Read-only (other pages reading profile timezone)**:
- `src/app/breathe/load.ts:219` — Already uses profile timezone
- `src/app/breathe/page.tsx:132` — Already uses profile timezone
- `src/app/progress/page.tsx:74` — Already uses profile timezone
- `src/app/session/[id]/page.tsx:191` — Already uses profile timezone
- `src/app/history/page.tsx:47` — Already uses profile timezone

**Dev harnesses** (test fixtures, use hard-coded timezone):
- `src/app/dev/breathe/routine/[slug]/session/page.tsx:53`
- `src/app/dev/breathe/[slug]/session/page.tsx:57`
- `src/app/dev/breathe/journey/[slug]/page.tsx:47`
- `src/app/dev/breathe/journey/[slug]/session/page.tsx:36`
- `src/app/dev/breathe/page.tsx:38`

**Migration path:**
```diff
- const timezone = profile.timezone || "Asia/Kolkata";
+ const timezone = resolveTimezoneWithProfile(profile.timezone);
```

These files are already reading `profile.timezone` first, so they already respect user preferences. The change would add gym timezone as a middle priority between user and default.

## Troubleshooting

### "Brand validation failed"

**Problem:** Build fails with brand validation error.

**Solution:**
- Check that all colors are 6-digit hex codes (`#RRGGBB`, not `#RGB` or `rgb(...)`)
- Verify timezone is a valid IANA name
- Ensure `siteUrl` is a valid URL
- Check that all required icon paths are set

### Colors don't change

**Problem:** Changed brand colors but UI still shows old colors.

**Solutions:**
- Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R)
- Clear build cache: `rm -rf .next && npm run build`
- Verify `NEXT_PUBLIC_BRAND` is set correctly
- Check browser console for `BrandThemeInjector` errors

### Wrong brand loads

**Problem:** Wrong brand loads despite setting `NEXT_PUBLIC_BRAND`.

**Solutions:**
- Verify the environment variable is set at **build time**, not just runtime
- Check the brand ID matches exactly (case-sensitive)
- Restart dev server: `NEXT_PUBLIC_BRAND=your-brand npm run dev`
- Rebuild: `NEXT_PUBLIC_BRAND=your-brand npm run build`

### Timezone doesn't apply

**Problem:** App still uses `Asia/Kolkata` despite setting brand timezone.

**Solutions:**
- Verify timezone is a valid IANA name (run `npm run test:branding`)
- Check files listed in "Follow-Up" section haven't been modified yet
- User's profile timezone overrides brand timezone (check `profiles.timezone`)
- Browser-detected timezone overrides brand timezone on client (expected behavior)

### Hydration mismatch on dates

**Problem:** React hydration warning on date/time displays.

**Solution:**
Add `suppressHydrationWarning` to elements showing browser-detected times:

```tsx
<time suppressHydrationWarning>
  {formatInTimezone(date, resolveTimezone())}
</time>
```

This is expected when server renders with gym timezone but client shows browser timezone.

## Support

For questions or issues with white-label theming:
1. Run `npm run test:branding` and include output
2. Check this documentation's troubleshooting section
3. Verify your brand configuration follows the examples above
4. Include your brand definition (without sensitive URLs) when reporting issues
