import { describe, it, expect } from "vitest";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processCall, type ProcessDeps } from "@/lib/pipeline/process-call";
import type { Extractor } from "@/lib/pipeline/extractor";
import { GoldenExtractor } from "@/replay/golden";
import type { NormalizedCall } from "@/lib/vaani/adapter";
import { loadPhoneTranscripts } from "@/replay/transcripts";

const calls = Object.fromEntries(loadPhoneTranscripts().map((c) => [c.id, c]));
const norm = (id: string, over: Partial<NormalizedCall> = {}): NormalizedCall => ({
  vaaniCallId: `T-${id}`, callerNumber: calls[id].callerNumber, startedAt: calls[id].startedAt, durationSec: calls[id].durationSec,
  language: "en", callerName: null, transcript: calls[id].transcript, ...over,
});
const setup = () => {
  const store = new MemoryStore();
  const golden = new GoldenExtractor();
  const seen: string[] = [];
  const extractor: Extractor = { extract: async (i) => { seen.push(i.redactedTranscript); return golden.extract(); } };
  const deps = (id: string): ProcessDeps => { golden.current = id; return { store, extractor, now: () => calls[id].startedAt }; };
  return { store, golden, seen, deps };
};

describe("processCall", () => {
  it("is idempotent: the same call delivered twice creates one lead and one outbox row", async () => {
    const { store, deps } = setup();
    const a = await processCall(deps("T01"), norm("T01"));
    const b = await processCall(deps("T01"), norm("T01"));
    expect(a.status).toBe("processed");
    expect(b).toMatchObject({ status: "duplicate", callId: a.callId });
    expect(store.leads.size).toBe(1);
    expect(store.outbox.size).toBe(1);
  });

  it("never sends the caller's name or phone number to the extractor, yet keeps them for the lead", async () => {
    const { store, seen, deps } = setup();
    await processCall(deps("T17b"), norm("T17b", { transcript: calls.T17b.transcript + "\nCaller: my number is 9876543210" }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toMatch(/Ritu|Kapoor/);
    expect(seen[0]).not.toMatch(/9876543210/);
    const lead = [...store.leads.values()][0];
    expect(lead.name).toBe("Ritu Kapoor");
    expect(lead.phone).toBe("+919000000017");
  });

  it("a missed or silent call skips the AI step (no cost) and queues a callback task", async () => {
    const { store, seen, deps } = setup();
    const out = await processCall(deps("T08"), norm("T08"));
    expect(out).toMatchObject({ decision: "incomplete", reasonCode: "incomplete_call" });
    expect(seen).toHaveLength(0);
    const row = [...store.outbox.values()][0];
    expect((row.payload as { tasks: { subject: string }[] }).tasks[0].subject).toMatch(/Call back/);
    expect([...store.leads.values()][0].cost.llmCostInr).toBe(0);
  });

  it("holds a dropped call's HubSpot write for 10 minutes", async () => {
    const { store, deps } = setup();
    await processCall(deps("T17a"), norm("T17a"));
    const row = [...store.outbox.values()][0];
    expect(row.nextAttemptAt.getTime() - calls.T17a.startedAt.getTime()).toBe(10 * 60_000);
  });

  it("dedupe: a redial within 10 minutes supersedes the dropped call and cancels its pending write", async () => {
    const { store, deps } = setup();
    const first = await processCall(deps("T17a"), norm("T17a"));
    const second = await processCall(deps("T17b"), norm("T17b"));
    expect(second).toMatchObject({ status: "processed", decision: "qualified" });
    if (first.status !== "processed" || second.status !== "processed") throw new Error("unexpected");
    expect(second.supersededLeadIds).toEqual([first.leadId]);
    expect(store.leads.get(first.leadId)!.supersededByCallId).toBe(second.callId);
    const rows = [...store.outbox.values()];
    expect(rows.find((r) => r.leadId === first.leadId)!.status).toBe("cancelled");
    expect(rows.find((r) => r.leadId === second.leadId)!.status).toBe("pending");
  });

  it("does not supersede when the earlier call was more than 10 minutes before", async () => {
    const { store, deps } = setup();
    await processCall(deps("T17a"), norm("T17a"));
    const late = new Date(calls.T17b.startedAt.getTime() + 20 * 60_000);
    const second = await processCall({ ...deps("T17b"), now: () => late }, norm("T17b", { startedAt: late }));
    expect(second.status === "processed" && second.supersededLeadIds).toEqual([]);
    expect([...store.outbox.values()].every((r) => r.status === "pending")).toBe(true);
  });

  it("a different caller within the window is not a duplicate", async () => {
    const { store, deps } = setup();
    await processCall(deps("T17a"), norm("T17a"));
    const other = await processCall(deps("T17b"), norm("T17b", { callerNumber: "+919111111111" }));
    expect(other.status === "processed" && other.supersededLeadIds).toEqual([]);
    expect(store.outbox.size).toBe(2);
  });

  it("records per-call cost from the configured rates", async () => {
    const store = new MemoryStore();
    const extractor: Extractor = { extract: async () => ({ ...(await Object.assign(new GoldenExtractor(), { current: "T01" }).extract()), usage: { inputTokens: 1_000_000, outputTokens: 100_000 } }) };
    await processCall({ store, extractor, now: () => calls.T01.startedAt }, norm("T01"));
    const cost = [...store.leads.values()][0].cost;
    expect(cost.voiceMinutes).toBe(4.2);
    expect(cost.voiceCostInr).toBe(21);
    expect(cost.llmCostInr).toBeCloseTo(((0.3 + 0.25) * 85), 2); // 1M in at $0.30 + 0.1M out at $2.50, x Rs 85
  });

  it("an extraction failure marks the call failed and rethrows; a retry then succeeds without duplicating", async () => {
    const store = new MemoryStore();
    const golden = new GoldenExtractor();
    golden.current = "T01";
    let fail = true;
    const extractor: Extractor = { extract: async () => { if (fail) throw new Error("model down"); return golden.extract(); } };
    const deps = { store, extractor, now: () => calls.T01.startedAt };
    await expect(processCall(deps, norm("T01"))).rejects.toThrow("model down");
    const call = [...store.calls.values()][0];
    expect(call.status).toBe("failed");
    expect(store.leads.size).toBe(0);
    fail = false;
    const retry = await processCall(deps, norm("T01"));
    expect(retry.status).toBe("processed");
    expect(store.calls.size).toBe(1);
    expect(store.leads.size).toBe(1);
  });

  it("escalations get an urgent 15-minute task, and revisit dates become tasks", async () => {
    const { store, deps } = setup();
    await processCall(deps("T09"), norm("T09"));
    await processCall(deps("T07"), norm("T07"));
    const tasks = [...store.outbox.values()].flatMap((r) => (r.payload as { tasks: { subject: string; dueAt: string }[] }).tasks);
    const urgent = tasks.find((t) => t.subject.startsWith("URGENT"))!;
    expect(new Date(urgent.dueAt).getTime() - calls.T09.startedAt.getTime()).toBe(15 * 60_000);
    expect(tasks.some((t) => t.subject.startsWith("Revisit"))).toBe(true);
  });

  it("the handoff note merges the caller's name and number back in, after the AI step", async () => {
    const { store, deps } = setup();
    await processCall(deps("T01"), norm("T01"));
    const html = ([...store.outbox.values()][0].payload as { noteHtml: string }).noteHtml;
    expect(html).toContain("Priya");
    expect(html).toContain("+919000000001");
    expect(html).toContain("Kothrud");
  });
});
