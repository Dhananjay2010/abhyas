import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="Breathe">
      <Bar className="mt-3 h-4 w-40" />
      <Bar className="mt-6 h-9 w-full" />
      <Card className="mt-7 h-[88px] rounded-2xl" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="h-[84px] rounded-2xl" />
        ))}
      </div>
    </ScreenSkeleton>
  );
}
