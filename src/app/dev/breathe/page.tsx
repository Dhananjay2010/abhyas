import { notFound } from "next/navigation";
import { BreathePreview } from "./preview";

/** Development-only harness with short phases so cycling can be watched. */
export const dynamic = "force-dynamic";

export default async function DevBreathePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Breathing harness</h1>
      <BreathePreview />
    </main>
  );
}
