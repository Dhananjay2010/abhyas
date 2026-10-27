import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthedClient } from "@/lib/supabase/auth";
import { checkGymOwnership } from "@/lib/gym/owner-check";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

export default async function OwnerBrandingPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const ownership = await checkGymOwnership(supabase, user.id);
  if (!ownership.isOwner || !ownership.gymId) {
    // Not an owner: redirect to home
    redirect("/");
  }

  // Fetch current branding settings
  const { data: gym } = await supabase
    .from("gyms")
    .select("name, display_name, logo_url, primary_color, accent_color")
    .eq("id", ownership.gymId)
    .single();

  const initial = {
    gymName: gym?.name ?? "",
    displayName: gym?.display_name ?? "",
    logoUrl: gym?.logo_url ?? "",
    primaryColor: gym?.primary_color ?? "",
    accentColor: gym?.accent_color ?? "",
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 pb-28">
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted hover:text-fg transition-colors mb-4"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Gym Branding</h1>
        <p className="mt-2 text-sm text-muted">
          Customize your gym&apos;s appearance for your members
        </p>
      </div>

      <BrandingForm
        gymId={ownership.gymId}
        gymName={ownership.gymName ?? ""}
        initial={initial}
      />
    </main>
  );
}
