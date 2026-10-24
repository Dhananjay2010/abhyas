# Launch Checklist

This document contains deployment notes, gotchas, and best practices for launching Abhyas or a white-label deployment.

## Vercel Deployments

### Deployment Rate Limits

**Issue**: Vercel's Hobby plan limits the number of deployments per day. Exceeding this limit results in `rate-limited` deployment failures.

**Symptoms**: 
- Deployment fails with status "rate-limited"
- Recent examples: commits a24e802 and 9aa5ee6 showed this error
- Multiple PR pushes or merges in a short period can trigger the limit

**Current Limits**:
Vercel's Hobby plan deployment limits are documented at:
https://vercel.com/docs/limits/overview#deployments

Check the "Deployments" row under "Hobby" plan limits for the current daily cap.

**What Counts Toward the Limit**:
- Production deployments (pushes to `main`)
- Preview deployments (PR pushes, if enabled)
- Manual redeployments via the dashboard

**Mitigation in This Repo**:
`vercel.json` is already configured to limit automatic deployments to the `main` branch:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true
    }
  }
}
```

This prevents automatic deployments for other branches, but **preview deployments for PRs may still count toward your limit** if enabled in the Vercel dashboard.

**Options to Avoid Rate Limits**:

1. **Batch merges**: Instead of merging PRs one at a time throughout the day, batch multiple PRs into a single merge window to reduce the number of production deployments.

2. **Disable PR preview deployments**: In the Vercel project dashboard:
   - Go to Settings → Git
   - Disable "Preview Deployments" for pull requests
   - This means only pushes to `main` will deploy
   - Trade-off: no automatic preview URLs for PRs

3. **Upgrade to Pro plan**: Vercel's Pro plan has significantly higher deployment limits (check current limits at the link above).

4. **Use a deployment queue**: Coordinate with your team to spread deployments throughout the day instead of concentrating them.

**Checking Your Current Usage**:
- Visit your Vercel dashboard
- Go to the project's Deployments tab
- Count the number of deployments today (resets at midnight UTC)
- Compare against the documented limit for your plan

**Best Practices**:
- Merge and test locally before pushing to `main`
- Use `npm run build` locally to catch build errors before deploying
- Run `npm test` before merging to avoid deploying broken code
- Coordinate deployment timing with your team if on a Hobby plan

**When Rate-Limited**:
- Wait for the daily limit to reset (midnight UTC)
- OR upgrade to a higher plan
- OR deploy to a different platform temporarily (Netlify, Railway, etc.)

## Pre-Deployment Checklist

Before deploying a new brand or major update:

- [ ] Run `npm test` and verify all tests pass
- [ ] Run `npm run build` and verify the build succeeds
- [ ] Verify `NEXT_PUBLIC_BRAND` is set correctly for the deployment
- [ ] Check that all required environment variables are set in the hosting dashboard
- [ ] Verify icon files exist in `/public/icons/` for the active brand
- [ ] Test timezone resolution: verify "today" displays correctly for the gym's timezone
- [ ] Check PWA manifest at `/manifest.webmanifest`
- [ ] Verify brand colors render correctly (no hard-coded colors leaked)
- [ ] Test on mobile: PWA install, offline mode, theme color
- [ ] Check Open Graph metadata (share the URL on Slack/social to preview)

## Post-Deployment Verification

After deployment:

- [ ] Visit the live site and verify the correct brand loaded
- [ ] Check that the title and favicon match the brand
- [ ] Test sign-in flow end-to-end
- [ ] Verify onboarding saves timezone correctly
- [ ] Test a full session: warm-up → exercises → cooldown → complete
- [ ] Check that "today" and session dates use the correct timezone
- [ ] Test Settings: verify timezone picker works and saves
- [ ] Verify PWA manifest: install on mobile and check home screen icon/name

## Rollback Plan

If a deployment breaks production:

1. **Immediate**: Revert the commit on `main` and push
2. **OR**: Roll back to the previous deployment in the Vercel dashboard (Deployments → previous deployment → three-dot menu → "Promote to Production")
3. **Investigate locally**: Pull the reverted commit to a branch and debug
4. **Fix and redeploy**: Once fixed, merge to `main` again

## Troubleshooting Common Issues

### "Brand validation failed"

**Cause**: Invalid brand configuration in `src/lib/branding.ts`

**Fix**:
- Verify all colors are 6-digit hex codes (`#RRGGBB`)
- Check timezone is a valid IANA name
- Run `npm run test:branding` locally to see the exact error

### Deployment succeeded but wrong brand shows

**Cause**: `NEXT_PUBLIC_BRAND` not set or set incorrectly

**Fix**:
- Check the environment variable in Vercel dashboard (Settings → Environment Variables)
- Verify it's set for "Production" environment
- Redeploy to pick up the updated variable

### Hydration errors on dates/times

**Cause**: Server renders with gym timezone, client renders with browser timezone

**Fix**:
- Add `suppressHydrationWarning` to `<time>` elements that show browser-detected times
- This is expected behavior for timezone-sensitive displays

### Database connection fails after deployment

**Cause**: Supabase environment variables not set

**Fix**:
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel dashboard
- These are required for the app to connect to your Supabase project
- Get them from your Supabase project dashboard (Settings → API)

## Support Contacts

For deployment issues:
- Vercel support: https://vercel.com/support
- Supabase support: https://supabase.com/support
- Internal: [Add your team's contact info here]
