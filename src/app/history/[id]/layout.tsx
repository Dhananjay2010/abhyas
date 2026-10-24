import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { guardHistoryRoute } from "@/lib/route-guards";

export default async function HistoryDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  await guardHistoryRoute(supabase, user.id, id);

  return <>{children}</>;
}
