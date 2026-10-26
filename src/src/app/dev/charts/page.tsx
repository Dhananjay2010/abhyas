import { notFound } from "next/navigation";
import { BarChart, LineChart, StatTile } from "@/components/charts";

/** Development-only harness for eyeballing chart geometry and labels. */
export const dynamic = "force-dynamic";

const weight = [
  ["1 Aug", 78.4], ["8 Aug", 78.0], ["15 Aug", 77.6], ["22 Aug", 77.9],
  ["29 Aug", 77.1], ["5 Sep", 76.8], ["12 Sep", 76.4],
].map(([label, value]) => ({ label: label as string, value: value as number }));

const volume = [
  ["12 Aug", 4820], ["14 Aug", 5100], ["17 Aug", 4650], ["19 Aug", 5320],
  ["21 Aug", 5010], ["24 Aug", 5680], ["26 Aug", 5440], ["28 Aug", 3200],
  ["31 Aug", 5910], ["2 Sep", 6050], ["4 Sep", 5780], ["7 Sep", 6320],
].map(([label, value]) => ({ label: label as string, value: value as number }));

const bench = [
  ["12 Aug", 78], ["19 Aug", 80.5], ["26 Aug", 80.5], ["2 Sep", 83], ["9 Sep", 85.5],
].map(([label, value]) => ({ label: label as string, value: value as number }));

export default async function DevChartsPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Chart harness</h1>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile label="Streak" value="7" sub="sessions in a row" />
        <StatTile label="Best streak" value="11" sub="sessions" />
        <StatTile label="Sessions" value="34" sub="completed" />
        <StatTile label="Volume lifted" value="62,000 kg" sub="all time" />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Body weight</h2>
        <LineChart points={weight} unit="kg" title="Body weight" />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Volume per session</h2>
        <BarChart points={volume} unit="kg" title="Volume per session" />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Barbell Bench Press</h2>
        <LineChart points={bench} unit="kg" title="Barbell Bench Press" height={110} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Single point</h2>
        <LineChart points={[{ label: "9 Sep", value: 76.4 }]} unit="kg" title="Body weight" />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Empty</h2>
        <LineChart points={[]} unit="kg" title="Body weight" />
      </section>
    </main>
  );
}
