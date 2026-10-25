import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="Yoga">
      <Bar className="mt-3 mb-8 h-4 w-64" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28" />
        ))}
      </div>
    </ScreenSkeleton>
  );
}
