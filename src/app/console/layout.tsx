import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireSignedIn } from "@/lib/console/auth";
import { logout } from "@/app/login/actions";

export const metadata = { title: "Console | Aangan Studio", robots: { index: false, follow: false } };

const links = [
  ["/console", "Overview"], ["/console/declined", "Declined review"], ["/console/health", "Sync health"],
  ["/console/costs", "Costs"], ["/console/designers", "Designers"], ["/console/replay", "Replay Lab"],
] as const;

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-zinc-500">Loading…</p>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

// Reads the session cookie, so it must sit behind Suspense (Cache Components). Nothing below renders without a valid session.
async function Gate({ children }: { children: ReactNode }) {
  await requireSignedIn();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <nav aria-label="Console" className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-200 pb-3 text-sm dark:border-zinc-800">
        <span className="font-semibold">Aangan console</span>
        {links.map(([href, label]) => <Link key={href} href={href} className="underline-offset-4 hover:underline">{label}</Link>)}
        <Link href="/" className="text-zinc-500 underline-offset-4 hover:underline">Public dashboard</Link>
        <form action={logout} className="ml-auto"><button type="submit" className="text-zinc-500 underline-offset-4 hover:underline">Sign out</button></form>
      </nav>
      {children}
    </div>
  );
}
