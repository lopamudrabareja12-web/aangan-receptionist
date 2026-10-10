import { HubSpotClient } from "@/lib/hubspot/client";
import type { Extractor } from "@/lib/pipeline/extractor";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processCall } from "@/lib/pipeline/process-call";
import { runOutbox } from "@/lib/pipeline/sync";
import type { NormalizedCall } from "@/lib/vaani/adapter";
import { EXPECTED, type Expected } from "./expected";
import { GoldenExtractor } from "./golden";
import { MockHubSpot } from "./mock-hubspot";
import { groupOf, type Group } from "./split";
import type { ReplayCall } from "./transcripts";

export interface ReplayRow {
  id: string;
  group: Group;
  expected: string;
  actual: { decision: string; reasonCode: string | null; flags: string[]; revisitOn: string | null; stage: string | null };
  match: boolean;
  problems: string[];
}

export interface ReplayReport {
  extractor: "golden" | "gemini";
  rows: ReplayRow[];
  summary: { total: number; matched: number; examples: { total: number; matched: number }; heldOut: { total: number; matched: number } };
  invariants: { name: string; ok: boolean }[];
  hubspot: { contacts: number; deals: number; notes: number; tasks: number };
  tokens: { input: number; output: number };
}

const stageLabelKey = (mock: MockHubSpot, props: Record<string, string | number | undefined>) => mock.stageKeyOf(props.dealstage) ?? null;

/** Runs historical calls through the real pipeline against an in-memory store and a MOCK HubSpot. No phone, no live CRM. */
export async function runReplay(opts: { calls: ReplayCall[]; extractor?: Extractor }): Promise<ReplayReport> {
  const golden = new GoldenExtractor();
  const extractor = opts.extractor ?? golden;
  const store = new MemoryStore();
  const mock = new MockHubSpot();
  const client = new HubSpotClient({ token: "mock-token", fetch: mock.fetch, sleep: async () => {} });
  const idByCallRow = new Map<string, string>(); // our call id -> replay id
  const tokens = { input: 0, output: 0 };
  const counting: Extractor = {
    extract: async (i) => {
      const r = await extractor.extract(i);
      tokens.input += r.usage.inputTokens;
      tokens.output += r.usage.outputTokens;
      return r;
    },
  };

  const outcomes = new Map<string, Awaited<ReturnType<typeof processCall>>>();
  for (const c of opts.calls) {
    golden.current = c.id;
    const call: NormalizedCall = {
      vaaniCallId: `REPLAY-${c.id}`, callerNumber: c.callerNumber, startedAt: c.startedAt, durationSec: c.durationSec,
      language: "en", callerName: null, transcript: c.transcript,
    };
    const out = await processCall({ store, extractor: counting, now: () => c.startedAt }, call, { isHistorical: true });
    outcomes.set(c.id, out);
    if (out.status === "processed") idByCallRow.set(out.callId, c.id);
  }
  const last = opts.calls[opts.calls.length - 1].startedAt;
  await runOutbox({ store, client, now: new Date(last.getTime() + 24 * 3600_000), limit: 100 });

  const leadFor = (replayId: string) => {
    const o = outcomes.get(replayId);
    return o && o.status === "processed" ? store.leads.get(o.leadId) : undefined;
  };

  const rows: ReplayRow[] = [];
  const baseIds = [...new Set(opts.calls.map((c) => c.baseId))];
  for (const baseId of baseIds) {
    const exp: Expected = EXPECTED[baseId];
    const target = opts.calls.find((c) => c.id === (baseId === "T17" ? "T17b" : baseId))!;
    const lead = leadFor(target.id);
    const problems: string[] = [];
    if (!lead) {
      rows.push({ id: baseId, group: groupOf(baseId), expected: exp.note, actual: { decision: "none", reasonCode: null, flags: [], revisitOn: null, stage: null }, match: false, problems: ["no lead created"] });
      continue;
    }
    const decisionOk = exp.decision === "qualified_any" ? lead.decision === "qualified" || lead.decision === "qualified_flagged" : lead.decision === exp.decision;
    if (!decisionOk) problems.push(`decision ${lead.decision}, expected ${exp.decision}`);
    if (exp.reason && lead.reasonCode !== exp.reason) problems.push(`reason ${lead.reasonCode}, expected ${exp.reason}`);
    for (const f of exp.flags ?? []) if (!lead.flags.includes(f)) problems.push(`missing flag ${f}`);
    const revisit = lead.raw.rubric.revisitOn;
    if (exp.revisit && !revisit) problems.push("expected a revisit date");
    if (typeof exp.revisit === "string" && revisit && !revisit.startsWith(exp.revisit)) problems.push(`revisit ${revisit}, expected ${exp.revisit}*`);
    // HubSpot: the deal must exist and sit in a stage that matches the decision
    const deal = mock.deals.find((d) => d.properties.aangan_call_id === lead.callId);
    const stage = deal ? stageLabelKey(mock, deal.properties) : null;
    if (!deal) problems.push("no deal in (mock) HubSpot");
    if (baseId === "T17") {
      const first = leadFor("T17a");
      const dealA = mock.deals.find((d) => d.properties.aangan_call_id === first?.callId);
      if (!first || first.supersededByCallId !== lead.callId) problems.push("dropped first call was not superseded");
      if (dealA) problems.push("dropped first call still created a HubSpot deal");
    }
    rows.push({ id: baseId, group: groupOf(baseId), expected: exp.note, actual: { decision: lead.decision, reasonCode: lead.reasonCode, flags: lead.flags, revisitOn: revisit, stage }, match: problems.length === 0, problems });
  }

  const dealStage = (d: { properties: Record<string, string | number | undefined> }) => stageLabelKey(mock, d.properties);
  const allText = JSON.stringify([...mock.notes, ...mock.tasks, ...mock.deals]);
  const invariants = [
    { name: "estimate amount only on qualified deals (stage New)", ok: mock.deals.every((d) => (d.properties.amount !== undefined) === (dealStage(d) === "new_qualified")) },
    { name: "every call was stored as historical (never mixed into live metrics)", ok: [...store.calls.values()].every((c) => c.isHistorical) },
    { name: "no per-sq-ft price figure appears in anything sent to HubSpot", ok: !/(per\s*sq\.?\s*ft|\/\s*sq\.?\s*ft)/i.test(allText) },
    { name: "no deal is created twice for the same call", ok: new Set(mock.deals.map((d) => d.properties.aangan_call_id)).size === mock.deals.length },
    {
      name: "every escalation deal has its own urgent callback task",
      ok: mock.deals.filter((d) => dealStage(d) === "escalation").every((d) =>
        mock.tasks.some((t) => String(t.properties.hs_task_subject).startsWith("URGENT") && JSON.stringify(t.associations).includes(`"id":"${d.id}"`))),
    },
  ];

  const count = (g?: Group) => {
    const r = rows.filter((x) => !g || x.group === g);
    return { total: r.length, matched: r.filter((x) => x.match).length };
  };
  return {
    extractor: opts.extractor ? "gemini" : "golden", rows,
    summary: { ...count(), examples: count("example"), heldOut: count("held_out") },
    invariants, hubspot: { contacts: mock.contacts.length, deals: mock.deals.length, notes: mock.notes.length, tasks: mock.tasks.length }, tokens,
  };
}

const pct = (m: number, t: number) => (t ? `${Math.round((m / t) * 100)}%` : "n/a");

export function formatReport(r: ReplayReport): string {
  const L: string[] = [`REPLAY LAB (extractor: ${r.extractor}; historical calls, mock HubSpot, no phone)`, ""];
  for (const x of r.rows) {
    L.push(`${x.match ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} [${x.group === "example" ? "example " : "held-out"}] ${x.actual.decision}${x.actual.reasonCode ? `/${x.actual.reasonCode}` : ""}${x.actual.flags.length ? ` flags=${x.actual.flags.join(",")}` : ""}  (${x.expected})`);
    for (const p of x.problems) L.push(`        - ${p}`);
  }
  const s = r.summary;
  L.push("", `Match rate: ${s.matched}/${s.total} (${pct(s.matched, s.total)})`, `  prompt-example calls: ${s.examples.matched}/${s.examples.total} (${pct(s.examples.matched, s.examples.total)})`, `  held-out calls:       ${s.heldOut.matched}/${s.heldOut.total} (${pct(s.heldOut.matched, s.heldOut.total)})`, "", "Invariants:");
  for (const i of r.invariants) L.push(`  ${i.ok ? "PASS" : "FAIL"}  ${i.name}`);
  L.push("", `Mock HubSpot received: ${r.hubspot.contacts} contacts, ${r.hubspot.deals} deals, ${r.hubspot.notes} notes, ${r.hubspot.tasks} tasks`);
  if (r.extractor === "golden") {
    L.push("", "NOTE: the golden extractor uses labels written by hand from these same transcripts. This run tests the rules, pipeline and HubSpot wiring,", "NOT Gemini's accuracy, so the example/held-out split is not meaningful here. Run with --extractor=gemini for that.");
  } else {
    L.push("", `Gemini tokens used: ${r.tokens.input} in, ${r.tokens.output} out`);
  }
  return L.join("\n");
}
