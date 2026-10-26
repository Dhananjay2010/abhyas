import { revalidatePath } from "next/cache";

/**
 * Screens that show training history in some form.
 *
 * Completing a set, finishing an exercise, ending a session, logging a yoga
 * video or a breathing practice all change what Today, History and Progress
 * say. Each of those screens used to be re-fetched from the server on every
 * visit, so missing a revalidation cost nothing and it was easy not to notice
 * that only "/today" was ever named.
 *
 * With the client router cache enabled (`staleTimes.dynamic` in
 * next.config.ts) that is no longer true: a screen that is not revalidated can
 * be served from the client's cache for up to thirty seconds after the data
 * behind it changed. Revalidating the whole set from one place is what makes
 * the cache safe to switch on.
 *
 * M1: Also revalidates /api/in-progress so the client-side resume bar can
 * refetch after starting, logging, or finishing a session.
 */
export function revalidateTrainingData() {
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/api/in-progress");
}
