import Link from "next/link";
import { branding } from "@/lib/branding";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="text-center">
        <h1 className="text-9xl font-bold tracking-tight text-fg">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-fg">Page not found</h2>
        <p className="mt-2 text-muted">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg transition hover:opacity-90"
        >
          Go to {branding.name}
        </Link>
      </div>
    </div>
  );
}
