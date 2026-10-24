import { getAuthedClient } from "@/lib/supabase/auth";
import { NotFoundContent } from "@/components/not-found-content";

export default async function SessionNotFound() {
  const { user } = await getAuthedClient();

  return <NotFoundContent user={user} />;
}
