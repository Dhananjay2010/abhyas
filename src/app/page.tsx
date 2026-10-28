import { renderLandingPageForRequest } from "./render-landing-page";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return renderLandingPageForRequest({ error, next });
}
