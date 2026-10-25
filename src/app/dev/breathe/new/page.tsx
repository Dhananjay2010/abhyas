import { notFound } from "next/navigation";
import { MINE } from "../fixture";
import { NewPreview } from "../previews";

/**
 * Development-only harness for making a practice of your own.
 *
 *   /dev/breathe/new         a new one
 *   /dev/breathe/new?id=…    editing the fixture's "Evening wind-down"
 */
export const dynamic = "force-dynamic";

export default async function DevNewPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const id = (await searchParams).id;
  const existing = typeof id === "string" ? MINE.find((m) => m.id === id && !m.basePatternId) : null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <NewPreview
        existing={existing ? { id: existing.id, name: existing.name, phases: existing.phases } : undefined}
      />
    </main>
  );
}
