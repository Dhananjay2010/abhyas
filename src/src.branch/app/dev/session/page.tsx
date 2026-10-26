import { notFound } from "next/navigation";
import { SessionPreview } from "./preview";

/**
 * Development-only harness for the guided session.
 *
 * Renders the real runner with stubbed persistence, so the warm-up, work,
 * cool-down and summary phases can be reviewed without a signed-in session.
 * Layout and interaction only -- the server actions are NOT exercised here.
 */
export const dynamic = "force-dynamic";

export default async function DevSessionPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SessionPreview />;
}
