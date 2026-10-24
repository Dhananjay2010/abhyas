import { getAuthedClient } from "@/lib/supabase/auth";
import { NotFoundContent } from "@/components/not-found-content";
import { BottomNav } from "@/components/bottom-nav";

export default async function NotFound() {
  const { user } = await getAuthedClient();

  return (
    <>
      <NotFoundContent user={user} />
      <BottomNav forceVisible />
    </>
  );
}
