import { getHubspotFunnel, getOverview } from "@/lib/console/queries";
import { card, decisionLabel, decisionStyle, inrFull, Notice, PageTitle, Tile } from "./ui";

export default async function ConsoleOverview() {
  const [o, funnel] = await Promise.all([getOverview(30), getHubspotFunnel()]);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
  const decisions = Object.entries(o.byDecision) as [string, number][];
  const maxStage = "stages" in funnel ? Math.max(1, ...funnel.stages.map((s) => s.count)) : 1;

  return (
    <>
      <PageTitle title="Live overview" sub={`Real calls from the last ${o.days} days. Replay and test data are never counted here.`} />
      {o.calls === 0 ? <div className="mb-4"><Notice>No live calls yet in this period. Make a test call from Vaani and it will appear within a couple of minutes.</Notice></div> : null}
      {o.failedOrStuck > 0 ? <div className="mb-4"><Notice tone="warn">{o.failedOrStuck} call(s) did not finish processing. See Sync health.</Notice></div> : null}

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Calls answered" value={String(o.calls)} sub="every call becomes a record" />
        <Tile label="After hours" value={pct(o.afterHours, o.calls)} sub={`${o.afterHours} outside 10am-7pm IST`} />
        <Tile label="Forwarded to designers" value={String(o.forwarded)} sub="qualified, with or without flags" />
        <Tile label="Estimated pipeline" value={inrFull(o.forwarded * o.avgProjectValue)} sub={`ESTIMATE: ${o.forwarded} × ${inrFull(o.avgProjectValue)} average project`} />
      </section>

      <section aria-label="Outcomes" className={`${card} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold">Where each enquiry went</h2>
        <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {decisions.map(([k, n]) => (
            <li key={k} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${decisionStyle[k]}`}>{decisionLabel[k]}</span>
              <span className="font-semibold">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Dropped calls that were redialled count once. Every decline is kept with its transcript under Declined review.</p>
      </section>

      <section aria-label="Pipeline stages" className={card}>
        <h2 className="mb-1 text-sm font-semibold">Pipeline by stage (from HubSpot)</h2>
        <p className="mb-3 text-xs text-zinc-500">Stage and owner live in HubSpot, so this is read from there each time.</p>
        {"error" in funnel ? (
          <Notice tone="warn">HubSpot could not be read right now: {funnel.error}</Notice>
        ) : (
          <ul className="space-y-2">
            {funnel.stages.map((s) => (
              <li key={s.label} className="grid grid-cols-[10rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[14rem_1fr_2rem]">
                <span>{s.label}</span>
                <span className="h-3 rounded bg-zinc-100 dark:bg-zinc-800"><span className="block h-3 rounded bg-emerald-500" style={{ width: `${(s.count / maxStage) * 100}%` }} /></span>
                <span className="text-right font-medium">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
