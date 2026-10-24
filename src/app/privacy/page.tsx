import Link from "next/link";
import { getSiteInfo, LEGAL_LAST_UPDATED } from "@/lib/legal/site-info";
import { branding } from "@/lib/branding";

export const metadata = {
  title: `Privacy Policy — ${branding.name}`,
};

export default function PrivacyPolicyPage() {
  const { gymName, supportEmail, gymAddress, gymPhone, appName } = getSiteInfo();
  
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-28">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted hover:text-fg"
      >
        ← Back
      </Link>
      
      <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
        <p className="text-sm font-medium text-warning">
          ⚠️ Draft — Pending Legal Review
        </p>
        <p className="mt-1 text-xs text-muted">
          This is a placeholder privacy policy. Before deployment, it must be reviewed
          and customized by qualified legal counsel for your jurisdiction and specific
          business practices.
        </p>
      </div>

      <h1 className="mt-8 text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>

      <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p>
            {appName} (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides a fitness tracking
            and workout guidance application. This Privacy Policy explains how we collect, use,
            disclose, and safeguard your information when you use our application.
          </p>
          <p>
            This policy applies to the white-label instances of {appName} provided to gym owners and
            their members. {gymName} is the data controller for your information under this instance.
          </p>
          <p>
            This privacy policy complies with the Digital Personal Data Protection Act, 2023 (DPDP Act) of India.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Information We Collect</h2>
          
          <h3 className="text-base font-medium mt-4">Account Information</h3>
          <p>When you create an account, we collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Name and email address (via Google OAuth)</li>
            <li>Profile photo (if provided via your Google account)</li>
          </ul>

          <h3 className="text-base font-medium mt-4">Health and Fitness Data</h3>
          <p>To provide personalized workout guidance, we collect and store:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Date of birth, biological sex, height, and weight</li>
            <li>Fitness level, goals, and exercise preferences</li>
            <li>Equipment availability</li>
            <li>Current and past injuries</li>
            <li>Workout session data (exercises performed, sets, reps, weights, duration)</li>
            <li>Body weight measurements over time</li>
            <li>Yoga video completion tracking</li>
            <li>Breathing exercise session data</li>
          </ul>

          <h3 className="text-base font-medium mt-4">Usage Data</h3>
          <p>We automatically collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Session timestamps and duration</li>
            <li>App preferences and settings</li>
            <li>Device information and timezone</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Generate personalized workout programs based on your profile</li>
            <li>Track your progress and adjust difficulty appropriately</li>
            <li>Prevent exercises that may aggravate existing injuries</li>
            <li>Display your workout history and statistics</li>
            <li>Provide session guidance with timers and rest periods</li>
            <li>Maintain app preferences across sessions</li>
            <li>Improve and optimize the application</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Data Storage and Security</h2>
          <p>
            Your data is stored securely using Supabase (PostgreSQL database) with row-level
            security policies ensuring users can only access their own data. We implement
            industry-standard security measures including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Encrypted connections (HTTPS/TLS)</li>
            <li>Authentication via secure OAuth 2.0 providers</li>
            <li>Row-level security policies preventing unauthorized data access</li>
            <li>Regular security updates and monitoring</li>
          </ul>
          <p>
            Despite our security measures, no system is completely secure. We cannot guarantee
            absolute security of your information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Data Sharing and Third Parties</h2>
          <p>We use the following third-party services:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Google OAuth:</strong> For authentication. Google&apos;s privacy policy
              applies to data they collect.
            </li>
            <li>
              <strong>Supabase:</strong> For database and authentication services. Data is stored
              in their secure infrastructure.
            </li>
            <li>
              <strong>Vercel:</strong> For application hosting and delivery.
            </li>
            <li>
              <strong>YouTube:</strong> We embed yoga videos from YouTube. YouTube&apos;s privacy
              policy applies when you watch these videos.
            </li>
            <li>
              <strong>Sentry:</strong> For error monitoring and diagnostics. Error reports are 
              sent to Sentry with personally identifiable information scrubbed. Sentry&apos;s 
              privacy policy applies to this data.
            </li>
          </ul>
          <p>
            We do not sell, rent, or trade your personal information to third parties for marketing
            purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Access:</strong> View all data we have collected about you
            </li>
            <li>
              <strong>Correction:</strong> Update inaccurate information through the Settings page
            </li>
            <li>
              <strong>Deletion:</strong> Delete your account and all associated data through the
              Settings page
            </li>
            <li>
              <strong>Data Portability:</strong> Request a copy of your data in a portable format
            </li>
            <li>
              <strong>Withdrawal of Consent:</strong> Stop using the app at any time
            </li>
          </ul>
          <p>
            To exercise these rights, use the account deletion feature in Settings or contact the
            gym that provided your access to this application.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active. When you delete your
            account through Settings, all your personal data and workout history is <strong>permanently 
            and immediately deleted</strong> from our systems with no recovery period. This deletion is 
            final and cannot be undone.
          </p>
          <p>
            Under the DPDP Act 2023, you have the right to request erasure of your personal data, 
            which can be exercised through the account deletion feature in Settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Children&apos;s Privacy</h2>
          <p>
            {appName} is not intended for use by individuals under the age of 16. We do not knowingly
            collect personal information from children under 16. If we become aware that a user is
            under 16, we will delete their account and data in compliance with the DPDP Act 2023.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. International Data Transfers</h2>
          <p>
            Your data is stored in Supabase&apos;s data centers. The specific location depends on
            your instance configuration (e.g., Mumbai region for the default deployment). By using {appName}, you consent to the transfer of your information to these locations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by updating the &quot;Last updated&quot; date at the top of this policy. Your
            continued use of {appName} after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">11. Contact Information</h2>
          <p>
            For questions about this Privacy Policy or our data practices, contact:
          </p>
          <div className="mt-2 pl-6">
            <p>{gymName}</p>
            {gymAddress && <p>{gymAddress}</p>}
            <p>
              <a href={`mailto:${supportEmail}`} className="text-accent hover:underline">
                {supportEmail}
              </a>
            </p>
            {gymPhone && <p>{gymPhone}</p>}
          </div>
        </section>
      </div>

      <div className="mt-12 flex gap-4 border-t border-border pt-6">
        <Link
          href="/terms"
          className="text-sm text-accent hover:underline"
        >
          Terms of Service →
        </Link>
      </div>
    </main>
  );
}
