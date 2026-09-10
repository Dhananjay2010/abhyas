import { Bar, Card } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28" aria-busy="true">
      <Bar className="h-4 w-20" />
      <Bar className="mt-4 h-9 w-52" />
      <span className="sr-only">Loading session…</span>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <Card className="h-16" />
        <Card className="h-16" />
        <Card className="h-16" />
      </div>
      <div className="mt-8 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24" />
        ))}
      </div>
    </main>
  );
}
