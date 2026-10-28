import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { getRequestBrandResolution } from "@/lib/runtime-brand";
import { renderLandingPage, type LandingPageDeps } from "./render-landing-page";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const deps: LandingPageDeps = { getAuthedClient, getRequestBrandResolution, redirect };
  return renderLandingPage({ error, next }, deps);
}
