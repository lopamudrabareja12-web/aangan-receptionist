import { notFound } from "next/navigation";
import { getCallDetail } from "@/lib/console/queries";
import { card, decisionLabel, decisionStyle, inrFull, istTime, Notice, PageTitle, words } from "../../ui";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getCallDetail(id);
  if (!d) notFound();
  const lead = d.lead;
  const decision = lead ? String(lead.decision) : null;
  const portal = process.env.HUBSPOT_PORTAL_ID;
  const dealId = lead?.hubspot_deal_id ? String(lead.hubspot_deal_id) : null;
  const fields: [string, unknown][] = lead
    ? [["Location", lead.location], ["Property", [lead.property_type, lead.carpet_area_sqft ? `${lead.carpet_area_sqft} sq ft` : null].filter(Boolean).join(", ")], ["Scope", lead.scope_summary], ["Timeline", lead.timeline_text],
       ["Property status", lead.property_status], ["Who decides", lead.owner_status ? words(String(lead.owner_status)) : null], ["Referral", lead.referral_source], ["Budget volunteered", lead.budget_volunteered]]
    : [];

  return (
    <>
      <PageTitle title={lead?.name ? String(lead.name) : "Call"} sub={`${istTime(d.call.startedAt)} IST · ${d.call.durationSec ? `${Math.round(d.call.durationSec / 60 * 10) / 10} min` : "duration unknown"}${d.call.language ? ` · ${d.call.language}` : ""}`} />
      {d.call.status !== "processed" ? <div className="mb-4"><Notice tone="warn">This call is &quot;{d.call.status}&quot;{d.call.error ? `: ${d.call.error}` : ""}.</Notice></div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {decision ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${decisionStyle[decision]}`}>{decisionLabel[decision] ?? decision}</span> : null}
        {Array.isArray(lead?.flags) ? (lead.flags as string[]).map((f) => <span key={f} className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700">{words(f)}</span>) : null}
        {lead?.decline_reason ? <span className="text-zinc-600 dark:text-zinc-300">Reason: {words(String(lead.decline_reason))}</span> : null}
        {portal && dealId ? <a className="underline" href={`https://app.hubspot.com/contacts/${portal}/record/0-3/${dealId}`}>Open the deal in HubSpot</a> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold">What was captured</h2>
          <dl className="space-y-1 text-sm">
            {fields.map(([k, v]) => <div key={k} className="grid grid-cols-[9rem_1fr] gap-2"><dt className="text-zinc-500">{k}</dt><dd>{v ? String(v) : <span className="text-zinc-400">not captured</span>}</dd></div>)}
          </dl>
          {lead?.summary ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{String(lead.summary)}</p> : null}
        </section>
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold">Handoff note</h2>
          {d.noteText ? <pre className="whitespace-pre-wrap text-sm leading-relaxed">{d.noteText}</pre> : <p className="text-sm text-zinc-500">No handoff note: this lead was not forwarded to a designer.</p>}
        </section>
      </div>

      <section className={`${card} mt-4`}>
        <h2 className="mb-2 text-sm font-semibold">Transcript</h2>
        <pre className="whitespace-pre-wrap text-sm leading-relaxed">{d.call.transcript || "No transcript was stored."}</pre>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold">Audit trail</h2>
          {d.events.length === 0 ? <p className="text-sm text-zinc-500">No events yet.</p> : (
            <ol className="space-y-1 text-sm">
              {d.events.map((e, i) => <li key={i}><span className="text-zinc-500">{istTime(e.at)}</span> · {words(e.type)}</li>)}
            </ol>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold">Cost of this call</h2>
          {d.cost ? <p className="text-sm">{d.cost.voiceMinutes} min of voice {inrFull(d.cost.voiceCost)} + AI {inrFull(d.cost.llmCost)}. <span className="text-zinc-500">Estimate from the configured rates.</span></p> : <p className="text-sm text-zinc-500">No cost recorded.</p>}
        </section>
      </div>
    </>
  );
}
