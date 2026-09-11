import { Bar } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28" aria-busy="true" aria-live="polite">
      <Bar className="h-4 w-20" />
      <div className="mt-6 flex flex-col items-center">
        <div className="h-[136px] w-[136px] animate-pulse rounded-full bg-surface-2" />
        <Bar className="mt-6 h-8 w-48" />
        <Bar className="mt-2 h-4 w-36" />
        <Bar className="mt-4 h-7 w-64 rounded-full" />
      </div>
      <Bar className="mt-8 h-12 w-full rounded-xl" />
      <Bar className="mt-8 h-12 w-full rounded-xl" />
      <Bar className="mt-8 h-16 w-full rounded-xl" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}
