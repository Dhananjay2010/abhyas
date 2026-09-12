import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { loadJourney } from "../../load";
import { JourneyView } from "./journey-view";

export const dynamic = "force-dynamic";

export default async function JourneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const loaded = await loadJourney(supabase, user.id, slug);
  if (!loaded) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <JourneyView
        resolved={loaded.resolved}
        prefs={loaded.prefs}
        firstPractice={loaded.firstPractice}
      />
    </main>
  );
}
