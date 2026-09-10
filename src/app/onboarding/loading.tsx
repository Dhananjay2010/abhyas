import { Bar, Card } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-6" aria-busy="true">
      <Bar className="h-1 w-full" />
      <Bar className="mt-10 h-8 w-64" />
      <Bar className="mt-3 h-4 w-48" />
      <span className="sr-only">Loading…</span>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-16" />
        ))}
      </div>
    </main>
  );
}
