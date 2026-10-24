import Link from "next/link";
import { getSiteInfo, LEGAL_LAST_UPDATED } from "@/lib/legal/site-info";

export const metadata = {
  title: "Terms of Service — Abhyas",
};

export default function TermsOfServicePage() {
  const { gymName, supportEmail, gymAddress, gymPhone, appName } = getSiteInfo();
  
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-28">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted hover:text-fg"
      >
        ← Back
      </Link>
      
      <div className="mt-6 rounded-lg border-2 border-warning/50 bg-warning/5 px-4 py-3">
        <p className="text-sm font-medium text-warning">
          ⚠️ Draft — Pending Legal Review
        </p>
        <p className="mt-1 text-xs text-muted">
          This is a placeholder terms of service document. Before deployment, it must be reviewed
          and customized by qualified legal counsel for your jurisdiction and specific
          business practices.
        </p>
      </div>

      <h1 className="mt-8 text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>

      <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing and using {appName} (&quot;the App,&quot; &quot;we,&quot; &quot;our,&quot;
            or &quot;us&quot;), you agree to be bound by these Terms of Service and our Privacy
            Policy. If you do not agree to these terms, do not use the App.
          </p>
          <p>
            This App is provided to you by {gymName} as a white-label service. Your membership
            or service agreement with {gymName} also applies to your use of this App.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Medical Disclaimer</h2>
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="font-medium text-danger">
              IMPORTANT: This application provides general fitness guidance, not medical advice.
            </p>
            <ul className="mt-2 list-disc pl-6 space-y-1 text-danger">
              <li>
                Always consult a qualified healthcare provider before starting any exercise program,
                especially if you have any medical conditions, injuries, or concerns.
              </li>
              <li>
                Stop exercising immediately and seek medical attention if you experience pain,
                dizziness, shortness of breath, or other concerning symptoms.
              </li>
              <li>
                The exercise recommendations are generated algorithmically and may not be
                appropriate for your individual health situation.
              </li>
              <li>
                We are not responsible for any injuries or health issues that may result from
                following the workout programs provided by this App.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Eligibility</h2>
          <p>
            You must be at least 16 years old to use this App. By using the App, you represent and
            warrant that you meet this age requirement.
          </p>
          <p>
            Access to this App may be restricted to members of [GYM NAME] or individuals who have
            been granted access through a specific arrangement.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Account Registration and Security</h2>
          <p>
            To use the App, you must create an account by signing in with Google OAuth. You agree
            to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide accurate and complete information during registration</li>
            <li>Maintain the security of your account credentials</li>
            <li>Not share your account with others</li>
            <li>Notify us immediately of any unauthorized access to your account</li>
          </ul>
          <p>
            You are responsible for all activities that occur under your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the App for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to the App or its systems</li>
            <li>Interfere with or disrupt the App&apos;s operation</li>
            <li>Upload malicious code or attempt to compromise the App&apos;s security</li>
            <li>Scrape, copy, or reverse engineer any part of the App</li>
            <li>Use the App in a way that could damage our reputation or services</li>
            <li>Share, redistribute, or resell access to the App without authorization</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Intellectual Property</h2>
          <p>
            The App and its content, including but not limited to software, text, graphics,
            logos, and exercise database, are owned by or licensed to us and are protected by
            copyright, trademark, and other intellectual property laws.
          </p>
          <p>
            You are granted a limited, non-exclusive, non-transferable license to use the App for
            your personal fitness tracking purposes only.
          </p>

          <h3 className="text-base font-medium mt-4">Third-Party Content</h3>
          <p>
            The App embeds yoga videos from YouTube (Yoga with Adriene). These videos are the
            property of their creators and subject to YouTube&apos;s Terms of Service. We do not
            claim ownership of this content.
          </p>
          <p>
            Exercise images and demonstrations may be sourced from third-party databases with
            appropriate licensing. Attribution is provided where required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Your Data</h2>
          <p>
            You retain ownership of the fitness data you enter into the App (workout logs, body
            measurements, etc.). By using the App, you grant us a license to use this data to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide the App&apos;s functionality to you</li>
            <li>Generate personalized workout recommendations</li>
            <li>Create aggregate, anonymized statistics for product improvement</li>
          </ul>
          <p>
            You may export or delete your data at any time through the Settings page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Service Availability and Changes</h2>
          <p>
            We strive to provide reliable service but do not guarantee that the App will be
            available 100% of the time. The App may be unavailable due to maintenance, technical
            issues, or other circumstances beyond our control.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue the App or any features at any
            time without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. Disclaimers and Limitation of Liability</h2>
          <p>
            THE APP IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
            OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR
            REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL,
            OR OTHER INTANGIBLE LOSSES RESULTING FROM:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your use or inability to use the App</li>
            <li>Any unauthorized access to or use of our servers or your personal information</li>
            <li>Any interruption or cessation of the App</li>
            <li>Any bugs, viruses, or harmful code transmitted through the App</li>
            <li>
              Any injuries, health issues, or other damages resulting from following workout
              recommendations
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless [GYM NAME], Abhyas, and their
            officers, directors, employees, and agents from any claims, damages, losses,
            liabilities, and expenses (including legal fees) arising from:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your use of the App</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any rights of another party</li>
            <li>Any injuries or health issues resulting from your use of the App</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">11. Termination</h2>
          <p>
            We may terminate or suspend your access to the App immediately, without prior notice,
            for any reason, including if you breach these Terms.
          </p>
          <p>
            You may terminate your account at any time by using the account deletion feature in
            the Settings page. Upon termination, all your data will be permanently deleted.
          </p>
          <p>
            Sections that by their nature should survive termination (including disclaimers,
            limitations of liability, and indemnification) will remain in effect.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">12. Governing Law and Disputes</h2>
          <p>
            These Terms are governed by the laws of India, without regard to conflict of
            law principles. This agreement is subject to the provisions of the Digital Personal Data 
            Protection Act, 2023 (DPDP Act) and the Information Technology Act, 2000.
          </p>
          <p>
            Any disputes arising from these Terms or your use of the App shall be subject to the 
            exclusive jurisdiction of the courts in [CITY, STATE], India.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">13. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Changes will be effective when
            posted, with the &quot;Last updated&quot; date revised accordingly. Your continued use
            of the App after changes are posted constitutes acceptance of the modified Terms.
          </p>
          <p>
            Material changes will be communicated through the App or via email to your registered
            address.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">14. Severability</h2>
          <p>
            If any provision of these Terms is found to be unenforceable or invalid, that provision
            shall be limited or eliminated to the minimum extent necessary, and the remaining
            provisions shall remain in full force and effect.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">15. Entire Agreement</h2>
          <p>
            These Terms, together with our Privacy Policy, constitute the entire agreement between
            you and us regarding the use of the App and supersede any prior agreements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">16. Contact Information</h2>
          <p>
            For questions about these Terms of Service, contact:
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
          href="/privacy"
          className="text-sm text-accent hover:underline"
        >
          Privacy Policy →
        </Link>
      </div>
    </main>
  );
}
