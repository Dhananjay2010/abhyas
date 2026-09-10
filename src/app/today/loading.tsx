import { Bar, Card } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28" aria-busy="true">
      <Bar className="h-4 w-48" />
      <Bar className="mt-3 h-9 w-40" />
      <span className="sr-only">Loading today’s plan…</span>

      <Card className="mt-7 h-16" />

      <div className="mt-7 space-y-2">
        <Bar className="h-3 w-32" />
        <Card className="h-24" />
        <Card className="h-24" />
        <Card className="h-24" />
      </div>

      <div className="mt-10 space-y-2">
        <Bar className="h-3 w-24" />
        <Card className="h-72" />
      </div>
    </main>
  );
}
