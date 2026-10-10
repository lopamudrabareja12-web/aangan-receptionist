import Link from "next/link";
import { ASSUMPTIONS as A, buildDashboard, inr } from "@/lib/dashboard/metrics";

// Computed from the historical replay (no database or API keys needed), so the page always renders.
export const metadata = { title: "Enquiry Dashboard | Aangan Studio" };

const decisionStyle: Record<string, string> = {
  qualified: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  qualified_flagged: "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-200",
  declined: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  deferred: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  escalation: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  incomplete: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
};
const decisionLabel: Record<string, string> = {
  qualified: "Qualified", qualified_flagged: "Qualified + flags", declined: "Declined (review)", deferred: "Deferred", escalation: "Escalation", incomplete: "Incomplete call",
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export default async function Dashboard() {
  const d = await buildDashboard();
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const funnel = [
    ["Forwarded to designers", d.counts.forwarded, "bg-emerald-500"],
    ["Declined (kept for review)", d.counts.declined, "bg-rose-500"],
    ["Deferred (revisit date)", d.counts.deferred, "bg-amber-500"],
    ["Escalated to Nikhil", d.counts.escalated, "bg-red-600"],
    ["Incomplete call (callback task)", d.counts.incomplete, "bg-zinc-500"],
  ] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">Aangan Studio · AI phone receptionist</p>
          <h1 className="text-3xl font-semibold tracking-tight">Enquiry dashboard</h1>
        </div>
        <nav className="flex gap-4 text-sm underline">
          <Link href="/components-map">Components Map</Link>
          <a href="https://github.com/lopamudrabareja12-web/aangan-receptionist">GitHub</a>
        </nav>
      </header>

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <strong>Historical replay, not live calls.</strong> These numbers come from the 20 September phone enquiries the human front desk handled,
        run through the real pipeline (real rules, no phone, mock CRM). Live calls will appear here once the Vaani line is connected. Values are
        <strong> estimates</strong> and costs use the rates listed at the bottom.
      </div>

      <section aria-label="What the system generates" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">What it generates</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Enquiries processed" value={String(d.counts.enquiries)} sub="every call becomes a record" />
          <Tile label="Forwarded to designers" value={`${d.counts.forwarded} of ${d.counts.enquiries}`} sub="with everything already asked" />
          <Tile label="Estimated pipeline" value={inr(d.forwardedValue)} sub={`ESTIMATE: ${d.counts.forwarded} leads × ${inr(A.avgProjectValueInr)} average project`} />
          <Tile label="After-hours enquiries" value={pct(d.afterHoursShare)} sub="outside 10am-7pm, answered anyway" />
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold">Where each enquiry went</h3>
          <ul className="space-y-2">
            {funnel.map(([label, count, color]) => (
              <li key={label} className="grid grid-cols-[11rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[14rem_1fr_2rem]">
                <span>{label}</span>
                <span className="h-3 rounded bg-zinc-100 dark:bg-zinc-800"><span className={`block h-3 rounded ${color}`} style={{ width: `${(count / d.counts.enquiries) * 100}%` }} /></span>
                <span className="text-right font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="What it costs" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">What it costs to run</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Voice calls" value={inr(d.cost.voice)} sub={`${d.cost.voiceMinutes.toFixed(1)} min × ₹${A.voiceRateInrPerMin}/min`} />
          <Tile label="AI extraction" value={inr(d.cost.gemini)} sub="Gemini 3.5 Flash-Lite, measured tokens" />
          <Tile label="Cost per enquiry" value={inr(d.cost.perEnquiry)} sub="voice + AI" />
          <Tile label="Cost per forwarded lead" value={inr(d.cost.perForwardedLead)} sub="the number that matters" />
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <caption className="p-4 pb-2 text-left text-sm font-semibold">Monthly cost and break-even ({d.monthly.calls} phone calls a month, assumed)</caption>
            <thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2">Demo (free plans)</th><th className="px-4 py-2">Real rollout</th></tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr><td className="px-4 py-2">Voice calls (Vaani)</td><td className="px-4 py-2">{inr(d.monthly.voice)}</td><td className="px-4 py-2">{inr(d.monthly.voice)}</td></tr>
              <tr><td className="px-4 py-2">AI extraction (Gemini)</td><td className="px-4 py-2">{inr(d.monthly.gemini)}</td><td className="px-4 py-2">{inr(d.monthly.gemini)}</td></tr>
              <tr><td className="px-4 py-2">Dashboard, database, hosting (Vercel, Supabase)</td><td className="px-4 py-2">₹0 (free plans)</td><td className="px-4 py-2">₹0 to a few thousand (paid tiers if needed)</td></tr>
              <tr><td className="px-4 py-2">HubSpot ({A.designerSeatsForRollout} designer seats × ${A.hubspotSeatUsdPerMonth})</td><td className="px-4 py-2">₹0 (free plan: 2 users)</td><td className="px-4 py-2">{inr(d.monthly.seats)}</td></tr>
              <tr className="font-semibold"><td className="px-4 py-2">Total per month</td><td className="px-4 py-2">{inr(d.monthly.demoTotal)}</td><td className="px-4 py-2">{inr(d.monthly.rolloutTotal)}</td></tr>
              <tr className="font-semibold"><td className="px-4 py-2">Break-even: extra projects per year to pay for it</td><td className="px-4 py-2">{d.breakEvenProjectsPerYear.demo.toFixed(2)}</td><td className="px-4 py-2">{d.breakEvenProjectsPerYear.rollout.toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p className="px-4 pb-3 text-xs text-zinc-500">Break-even is on project revenue ({inr(A.avgProjectValueInr)} average), not profit, so the true number is higher.</p>
        </div>
      </section>

      <section aria-label="All enquiries" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Every enquiry and what happened to it</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="px-3 py-2">Call</th><th className="px-3 py-2">When (IST)</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Why / flags</th><th className="px-3 py-2">CRM stage</th></tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-3 py-2">{r.when}{r.afterHours ? <span className="ml-1 text-xs text-zinc-500">(after hours)</span> : null}</td>
                  <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${decisionStyle[r.decision]}`}>{decisionLabel[r.decision] ?? r.decision}</span></td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{[r.reason?.replaceAll("_", " "), ...r.flags.map((f) => f.replaceAll("_", " "))].filter(Boolean).join(", ") || "clean"}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{r.stage?.replaceAll("_", " ") ?? "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Every decline is kept with its transcript for Nikhil to review. The pricing question is never answered with a number.</p>
      </section>

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <p><strong>Assumptions:</strong> voice ₹{A.voiceRateInrPerMin}/min (Vaani&apos;s estimate); Gemini ${A.geminiInputUsdPerM}/${A.geminiOutputUsdPerM} per million tokens (listed price, to confirm); ₹{A.usdInr} per US dollar (placeholder);
          average project {inr(A.avgProjectValueInr)} (midpoint of ₹8-14 lakh); {A.enquiriesPerMonth} enquiries a month with {Math.round(A.phoneShareOfEnquiries * 100)}% by phone (assumed).
          In HubSpot, Nikhil sees the same leads as deals in the &quot;Aangan Enquiries&quot; pipeline.</p>
      </footer>
    </main>
  );
}
