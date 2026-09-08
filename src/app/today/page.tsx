import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reads through RLS as the signed-in user — proves the policies and the
  // new-user trigger are both working end to end.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, onboarding_completed_at")
    .single();

  const { count: equipmentCount } = await supabase
    .from("equipment")
    .select("*", { count: "exact", head: true });

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Hello{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 text-muted">
        Signed in as {user?.email}. Onboarding and your first block come next.
      </p>

      <dl className="mt-8 space-y-3 rounded-xl border border-border bg-surface p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Profile row</dt>
          <dd>{error ? `error: ${error.message}` : "created by trigger ✓"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Onboarding</dt>
          <dd>{profile?.onboarding_completed_at ? "done" : "not started"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Equipment catalogue</dt>
          <dd>{equipmentCount ?? 0} items readable</dd>
        </div>
      </dl>

      <form action="/auth/signout" method="post" className="mt-8">
        <button className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg">
          Sign out
        </button>
      </form>
    </main>
  );
}
