import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { USER_PATTERN_COLUMNS, userPatternFromRow } from "@/lib/breathing/pattern";
import { CustomPatternForm } from "./custom-pattern-form";

export const dynamic = "force-dynamic";

/** `/breathe/new` to make one, `/breathe/new?id=…` to change one you made. */
export default async function NewPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const raw = (await searchParams).id;
  const id = typeof raw === "string" ? raw : null;

  if (!id) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
        <CustomPatternForm />
      </main>
    );
  }

  const { data } = await supabase
    .from("user_breathing_patterns")
    .select(USER_PATTERN_COLUMNS)
    .eq("id", id)
    .is("base_pattern_id", null)
    .maybeSingle();
  const mine = data ? userPatternFromRow(data) : null;
  if (!mine) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <CustomPatternForm existing={{ id: mine.id, name: mine.name, phases: mine.phases }} />
    </main>
  );
}
