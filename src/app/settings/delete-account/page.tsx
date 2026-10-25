import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { branding } from "@/lib/branding";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata = {
  title: `Delete Account — ${branding.name}`,
};

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const { user } = await getAuthedClient();
  if (!user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Delete Account</h1>
      <p className="mt-2 text-sm text-muted">
        Signed in as {user.email}
      </p>

      <div className="mt-8 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3">
        <p className="text-sm font-medium text-danger">
          ⚠️ This action cannot be undone
        </p>
        <p className="mt-2 text-xs text-muted">
          Deleting your account will permanently remove:
        </p>
        <ul className="mt-2 list-disc pl-6 text-xs text-muted space-y-1">
          <li>Your profile and account information</li>
          <li>All workout history and session logs</li>
          <li>Exercise progress and personal records</li>
          <li>Body weight measurements</li>
          <li>All settings and preferences</li>
          <li>Yoga and breathing practice history</li>
        </ul>
      </div>

      <DeleteAccountForm />
    </main>
  );
}
