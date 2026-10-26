import { Bar, Card } from "@/components/skeleton";

/**
 * The guided session is full-screen with no tab bar, so its skeleton uses the
 * runner's own frame rather than the shared one.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8" aria-busy="true">
      <Bar className="h-3 w-full" />
      <Bar className="mt-8 h-4 w-28" />
      <Bar className="mt-3 h-8 w-56" />
      <span className="sr-only">Loading your session…</span>
      <Card className="mt-8 h-40" />
      <div className="mt-4 space-y-2">
        <Card className="h-14" />
        <Card className="h-14" />
        <Card className="h-14" />
      </div>
      <div className="mt-auto pt-8">
        <Card className="h-14" />
      </div>
    </main>
  );
}
