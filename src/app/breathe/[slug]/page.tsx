import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { loadPractice } from "../load";
import { PracticeSetup } from "./practice-setup";

export const dynamic = "force-dynamic";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const loaded = await loadPractice(supabase, user.id, slug);
  if (!loaded) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <PracticeSetup
        pattern={loaded.pattern}
        prefs={loaded.prefs}
        lastCycles={loaded.lastCycles}
        firstPractice={loaded.firstPractice}
      />
    </main>
  );
}
