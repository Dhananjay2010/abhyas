import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { loadRoutine } from "../../load";
import { RoutineSetup } from "./routine-setup";

export const dynamic = "force-dynamic";

export default async function RoutinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const loaded = await loadRoutine(supabase, user.id, slug);
  if (!loaded) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <RoutineSetup
        resolved={loaded.resolved}
        prefs={loaded.prefs}
        firstPractice={loaded.firstPractice}
      />
    </main>
  );
}
