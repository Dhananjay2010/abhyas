import { notFound } from "next/navigation";
import { YogaPreview } from "./preview";

/** Development-only harness. The embeds are real videos, so the player is
 *  genuinely exercised; only persistence is stubbed. */
export const dynamic = "force-dynamic";

export default async function DevYogaPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Yoga harness</h1>
      <YogaPreview />
    </main>
  );
}
