import { notFound } from "next/navigation";
import { PRACTICES, PREFS } from "../fixture";
import { SetupPreview } from "../previews";

/**
 * Development-only harness for a practice's setup screen. Works for a built-in
 * practice, one you have retimed, and one of your own (`mine-<id>`).
 *
 *   ?fresh=1   never practised anything: the safety note shows
 *   ?last=11   done this pattern before, at 11 cycles
 */
export const dynamic = "force-dynamic";

export default async function DevPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const search = await searchParams;
  const pattern = PRACTICES.find((p) => p.slug === slug);
  if (!pattern) notFound();

  const last = Number(search.last);
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <SetupPreview
        pattern={pattern}
        prefs={PREFS}
        lastCycles={Number.isInteger(last) && last > 0 ? last : null}
        firstPractice={search.fresh === "1"}
      />
    </main>
  );
}
