import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="History">
      <Bar className="mt-3 mb-8 h-4 w-44" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-20" />
        ))}
      </div>
    </ScreenSkeleton>
  );
}
