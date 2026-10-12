import { requireSignedIn } from "@/lib/console/auth";
import { buildDashboard } from "@/lib/dashboard/metrics";
import { card, decisionLabel, decisionStyle, Notice, PageTitle, td, th, Tile, words } from "../ui";

export default async function ReplayLab() {
  await requireSignedIn();
  const { report } = await buildDashboard();
  const s = report.summary;
  const pct = (m: number, t: number) => (t ? `${Math.round((m / t) * 100)}%` : "n/a");
  return (
    <>
      <PageTitle title="Replay Lab" sub="The 20 September phone enquiries the human front desk handled, run through the real rules and a mock CRM, with no phone. Historical data: never mixed into live numbers." />
      <div className="mb-4"><Notice tone="warn">This page runs the pipeline with <strong>hand-written labels</strong>, so it tests the rules, the pipeline and the HubSpot wiring, not Gemini&apos;s accuracy. The last run with the real Gemini model matched 20 of 20 (10 of 10 on the held-out half). To repeat it: <code>npm run replay -- --extractor=gemini</code>.</Notice></div>
      <section className="mb-6 grid grid-cols-3 gap-3">
        <Tile label="Matched" value={`${s.matched}/${s.total}`} sub={pct(s.matched, s.total)} />
        <Tile label="Prompt-example calls" value={`${s.examples.matched}/${s.examples.total}`} sub="used as examples in the agent prompt" />
        <Tile label="Held-out calls" value={`${s.heldOut.matched}/${s.heldOut.total}`} sub="never shown to the agent" />
      </section>
      <section className={`${card} mb-6 overflow-x-auto`}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr><th className={th}>Call</th><th className={th}>Group</th><th className={th}>Result</th><th className={th}>Expected</th><th className={th}>Check</th></tr></thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} font-mono text-xs`}>{r.id}</td>
                <td className={td}>{r.group === "example" ? "prompt example" : "held out"}</td>
                <td className={td}><span className={`rounded px-2 py-0.5 text-xs font-medium ${decisionStyle[r.actual.decision]}`}>{decisionLabel[r.actual.decision] ?? r.actual.decision}</span>{r.actual.reasonCode ? <span className="ml-2 text-zinc-500">{words(r.actual.reasonCode)}</span> : null}</td>
                <td className={`${td} text-zinc-600 dark:text-zinc-300`}>{r.expected}</td>
                <td className={td}>{r.match ? "pass" : `FAIL: ${r.problems.join("; ")}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={card}>
        <h2 className="mb-2 text-sm font-semibold">Safety checks across all 20 calls</h2>
        <ul className="space-y-1 text-sm">{report.invariants.map((i) => <li key={i.name}>{i.ok ? "pass" : "FAIL"} · {i.name}</li>)}</ul>
      </section>
    </>
  );
}
