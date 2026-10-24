import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { guardBreatheRoute } from "@/lib/route-guards";

export default async function BreatheSlugLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  await guardBreatheRoute(supabase, user.id, slug);

  return <>{children}</>;
}
