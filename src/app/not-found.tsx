import Link from "next/link";
import { getAuthedClient } from "@/lib/supabase/auth";

export default async function NotFound() {
  // Check if user is signed in to show appropriate link
  const { user } = await getAuthedClient();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-6xl font-bold tracking-tight">404</h1>
        <h2 className="mt-4 text-2xl font-semibold">Page not found</h2>
        <p className="mt-2 text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href={user ? "/today" : "/"}
          className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          {user ? "Go to Today" : "Home"}
        </Link>
      </div>
    </main>
  );
}
