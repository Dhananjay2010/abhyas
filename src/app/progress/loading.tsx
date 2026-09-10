import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="Progress">
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-10">
        <Bar className="h-4 w-28" />
        <Bar className="mt-2 h-3 w-52" />
        <Card className="mt-3 h-40" />
      </div>
      <div className="mt-10">
        <Bar className="h-4 w-40" />
        <Card className="mt-3 h-40" />
      </div>
    </ScreenSkeleton>
  );
}
