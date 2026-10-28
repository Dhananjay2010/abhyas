import { pageDeps } from "./page-deps";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return pageDeps.renderLandingPageForRequest({ error, next });
}
