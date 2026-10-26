import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="Settings">
      <Bar className="mt-3 mb-8 h-4 w-56" />
      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Bar className="h-3 w-28" />
            <Card className="mt-3 h-14" />
          </div>
        ))}
      </div>
    </ScreenSkeleton>
  );
}
