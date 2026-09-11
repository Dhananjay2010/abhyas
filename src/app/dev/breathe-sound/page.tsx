import { notFound } from "next/navigation";
import { SoundLab } from "./sound-lab";

/** Development-only: the breathing tones, measured, and playable. */
export const dynamic = "force-dynamic";

export default async function DevBreatheSoundPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Sound lab</h1>
      <SoundLab />
    </main>
  );
}
