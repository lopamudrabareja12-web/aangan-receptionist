import { breakEven, summariseCosts } from "@/lib/console/costs";
import { getCosts } from "@/lib/console/queries";
import { saveSettings } from "../actions";
import { btn, card, inrFull, istTime, Notice, PageTitle, td, th, Tile } from "../ui";

const ASSUMED_CALLS_PER_MONTH = 100; // 200 enquiries a month (brief) × 50% by phone (assumption)
const FALLBACK_MINUTES = 5;

const FIELDS: [string, string, string][] = [
  ["voice_rate_inr_per_min", "Voice rate (₹ per minute)", "Vaani's own estimate; confirm on the invoice"],
  ["gemini_input_usd_per_m", "Gemini input ($ per million tokens)", "listed price; confirm on Google's page"],
  ["gemini_output_usd_per_m", "Gemini output ($ per million tokens)", "listed price; confirm on Google's page"],
  ["usd_inr", "₹ per US dollar", "placeholder rate"],
  ["resend_monthly_inr", "Email service (₹ per month)", "free tier today"],
  ["hosting_monthly_inr", "Hosting and database (₹ per month)", "free plans today"],
  ["avg_project_value_inr", "Average project value (₹)", "midpoint of ₹8-14 lakh"],
  ["conversion_rate", "Forwarded lead → project (0 to 1)", "placeholder: ask Nikhil for his real rate"],
];

export default async function Costs() {
  const c = await getCosts();
  const s = summariseCosts(c.rows.map((r) => ({ voiceMinutes: r.minutes, voiceCost: r.voiceCost, llmCost: r.llmCost })), c.qualified);
  const avgMin = s.calls ? s.voiceMinutes / s.calls : FALLBACK_MINUTES;
  const avgLlm = s.calls ? s.llmCost / s.calls : 0;
  const be = breakEven({
    callsPerMonth: ASSUMED_CALLS_PER_MONTH, avgVoiceMinutes: avgMin, avgLlmCostPerCall: avgLlm, voiceRatePerMin: c.settings.voice_rate_inr_per_min,
    resendMonthly: c.settings.resend_monthly_inr, hostingMonthly: c.settings.hosting_monthly_inr, avgProjectValue: c.settings.avg_project_value_inr, conversionRate: c.settings.conversion_rate,
  });

  return (
    <>
      <PageTitle title="Costs" sub="Every figure here is an estimate computed from the rates below, not billing data. Calls keep the cost worked out at the rates in force when they were processed." />
      {s.calls === 0 ? <div className="mb-4"><Notice>No live calls recorded yet, so per-call figures are empty. The break-even below uses a {FALLBACK_MINUTES}-minute average call until real calls arrive.</Notice></div> : null}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Voice" value={inrFull(s.voiceCost)} sub={`${s.voiceMinutes.toFixed(1)} min`} />
        <Tile label="AI extraction" value={inrFull(s.llmCost)} sub="Gemini" />
        <Tile label="Cost per call" value={s.calls ? inrFull(s.perCall) : "n/a"} sub="voice + AI" />
        <Tile label="Cost per forwarded lead" value={s.perQualifiedLead === null ? "n/a" : inrFull(s.perQualifiedLead)} sub={`${c.qualified} forwarded`} />
      </section>

      <section className={`${card} mb-6`}>
        <h2 className="mb-1 text-sm font-semibold">Break-even</h2>
        <p className="mb-3 text-xs text-zinc-500">At {ASSUMED_CALLS_PER_MONTH} calls a month (assumed: 200 enquiries × half by phone), averaging {avgMin.toFixed(1)} minutes.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Running cost" value={`${inrFull(be.monthlyCost)} / month`} sub={`${inrFull(be.annualCost)} a year`} />
          <Tile label="Extra projects to pay for it" value={`${be.extraProjectsPerYear.toFixed(2)} a year`} sub="on revenue, not profit, so the true figure is higher" />
          <Tile label="Extra forwarded leads needed" value={be.extraLeadsPerYear === null ? "n/a" : `${be.extraLeadsPerYear.toFixed(1)} a year`} sub={`at a ${Math.round(c.settings.conversion_rate * 100)}% lead-to-project rate`} />
        </div>
      </section>

      <section className={`${card} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold">Rates and assumptions (editable)</h2>
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([key, label, hint]) => (
            <label key={key} className="text-sm">
              <span className="block font-medium">{label}</span>
              <input name={key} type="number" step="any" min="0" defaultValue={c.settings[key]} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-zinc-900" />
              <span className="text-xs text-zinc-500">{hint}</span>
            </label>
          ))}
          <div className="sm:col-span-2"><button type="submit" className={btn}>Save rates</button></div>
        </form>
      </section>

      <section className={`${card} overflow-x-auto`}>
        <h2 className="mb-2 text-sm font-semibold">Cost per call</h2>
        {c.rows.length === 0 ? <p className="text-sm text-zinc-500">No live calls yet.</p> : (
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr><th className={th}>When (IST)</th><th className={th}>Minutes</th><th className={th}>Voice</th><th className={th}>AI</th><th className={th}>Tokens</th></tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {c.rows.map((r) => <tr key={r.callId}><td className={td}>{istTime(r.when)}</td><td className={td}>{r.minutes}</td><td className={td}>{inrFull(r.voiceCost)}</td><td className={td}>{inrFull(r.llmCost)}</td><td className={td}>{r.tokens}</td></tr>)}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
