import { Bar, Card, ScreenSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton title="Settings">
      <Bar className="mt-2 mb-8 h-4 w-64" />
      
      {/* Training section */}
      <div className="space-y-12">
        <section>
          <div className="mb-4">
            <Bar className="h-5 w-32 mb-1" />
            <Bar className="h-3 w-56" />
          </div>
          <div className="space-y-6">
            {/* Goal */}
            <div>
              <Bar className="h-4 w-16 mb-2" />
              <div className="space-y-2">
                <Card className="h-16" />
                <Card className="h-16" />
                <Card className="h-16" />
              </div>
            </div>
            {/* Level */}
            <div>
              <Bar className="h-4 w-16 mb-2" />
              <div className="space-y-2">
                <Card className="h-14" />
                <Card className="h-14" />
              </div>
            </div>
            {/* Days per week */}
            <div>
              <Bar className="h-4 w-32 mb-2" />
              <Card className="h-12" />
            </div>
          </div>
        </section>

        {/* Equipment section */}
        <section>
          <div className="mb-4">
            <Bar className="h-5 w-24 mb-1" />
            <Bar className="h-3 w-72" />
          </div>
          <Card className="h-14 mb-5" />
          <div className="space-y-4">
            <Bar className="h-3 w-32 mb-2" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="h-10 w-24" />
              ))}
            </div>
          </div>
        </section>

        {/* During session section */}
        <section>
          <Bar className="h-5 w-40 mb-4" />
          <div className="space-y-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-16" />
            ))}
          </div>
        </section>
      </div>
    </ScreenSkeleton>
  );
}
