import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { guardSessionRoute } from "@/lib/route-guards";

export default async function SessionLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  await guardSessionRoute(supabase, id);

  return <>{children}</>;
}
