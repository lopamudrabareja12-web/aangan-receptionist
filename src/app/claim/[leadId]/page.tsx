import { Suspense } from "react";
import { requireEnv } from "@/lib/env";
import { resolveLink } from "@/lib/pipeline/claim";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { getSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Claim a lead | Aangan Studio", robots: { index: false, follow: false } };

type Props = { params: Promise<{ leadId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ClaimPage(props: Props) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Suspense fallback={<p className="text-zinc-500">Loading the lead…</p>}>
        <ClaimContent {...props} />
      </Suspense>
    </main>
  );
}

async function ClaimContent({ params, searchParams }: Props) {
  const { leadId } = await params;
  const sp = await searchParams;
  const designerId = one(sp.d);
  const token = one(sp.t);
  const { CLAIM_LINK_SECRET } = requireEnv("CLAIM_LINK_SECRET");
  const r = await resolveLink(new SupabaseStore(getSupabase()), CLAIM_LINK_SECRET, leadId, designerId, token);

  if (!r.ok) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
        <h1 className="text-xl font-semibold">This link is not valid</h1>
        <p className="mt-2 text-sm">It may be incomplete or edited. Please open the link from your email again.</p>
      </section>
    );
  }

  const { assignment: a, designer, designers } = r;
  const owner = designers.find((x) => x.id === a.designerId);
  const mine = a.designerId === designer.id;
  const taken = (a.status === "claimed" || a.status === "auto_assigned") && !mine;
  const ready = !!a.hubspotDealId && !!designer.hubspotOwnerId;

  return (
    <>
      <p className="text-sm text-zinc-500">Hi {designer.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.subject}</h1>

      {one(sp.r) === "taken" && <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">Someone claimed it a moment before you.</p>}
      {mine ? (
        <p className="mt-4 rounded-lg bg-emerald-100 p-4 text-emerald-950">
          <strong>This lead is yours{a.via === "auto" ? " (auto-assigned)" : ""}.</strong> It is on your name in HubSpot. Please call the enquirer back.
        </p>
      ) : taken ? (
        <p className="mt-4 rounded-lg bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          Already taken by <strong>{owner?.name ?? "another designer"}</strong>. Nothing more to do.
        </p>
      ) : ready ? (
        <form method="POST" action="/api/claim" className="mt-4">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="d" value={designerId} />
          <input type="hidden" name="t" value={token} />
          <button type="submit" className="w-full rounded-lg bg-zinc-900 px-5 py-3 text-base font-semibold text-white hover:bg-zinc-700 sm:w-auto dark:bg-white dark:text-zinc-900">
            Claim this lead
          </button>
          <p className="mt-2 text-xs text-zinc-500">First to claim owns it. It then appears under your name in HubSpot.</p>
        </form>
      ) : (
        <p className="mt-4 rounded-lg bg-amber-100 p-4 text-amber-950">This lead is not ready to claim yet, or your account is not linked to HubSpot. Please ask Nikhil.</p>
      )}

      <article className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900" dangerouslySetInnerHTML={{ __html: a.noteHtml }} />
    </>
  );
}
