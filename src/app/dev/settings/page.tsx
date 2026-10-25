import { notFound } from "next/navigation";
import { SettingsPreview } from "./preview";

/** Development-only harness: real form, stubbed persistence. */
export const dynamic = "force-dynamic";

export default async function DevSettingsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Settings harness</h1>
      <SettingsPreview />
    </main>
  );
}
