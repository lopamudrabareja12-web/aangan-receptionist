import { HubSpotClient } from "@/lib/hubspot/client";
import type { Mail, Mailer } from "@/lib/mail/resend";
import { MemoryStore } from "@/lib/pipeline/memory-store";
import { processCall } from "@/lib/pipeline/process-call";
import type { Designer } from "@/lib/pipeline/store";
import { runOutbox } from "@/lib/pipeline/sync";
import { GoldenExtractor } from "@/replay/golden";
import { MockHubSpot } from "@/replay/mock-hubspot";
import { loadPhoneTranscripts } from "@/replay/transcripts";

export const SECRET = "test-claim-secret-0123456789";
export const BASE = "https://app.example.test";
export const NIKHIL = "nikhil@example.test";
export const calls = Object.fromEntries(loadPhoneTranscripts().map((c) => [c.id, c]));
export const min = (n: number) => n * 60_000;

/** Fake Resend: records every email, can be told to fail for one address, and de-duplicates by idempotency key like the real one. */
export class FakeMailer implements Mailer {
  sent: Mail[] = [];
  failFor = new Set<string>();
  private keys = new Map<string, string>();
  async send(mail: Mail) {
    if (this.failFor.has(mail.to)) throw new Error(`Resend 500: simulated failure for ${mail.to}`);
    if (mail.idempotencyKey && this.keys.has(mail.idempotencyKey)) return { id: this.keys.get(mail.idempotencyKey)! };
    const id = `mail-${this.sent.length + 1}`;
    if (mail.idempotencyKey) this.keys.set(mail.idempotencyKey, id);
    this.sent.push(mail);
    return { id };
  }
  to(addr: string) {
    return this.sent.filter((m) => m.to === addr);
  }
}

export const designer = (id: string, name: string, owner: string | null, onDuty = true): Designer => ({
  id, name, email: `${name.toLowerCase()}@example.test`, onDuty, isSenior: false, hubspotOwnerId: owner,
});

export function makeWorld(opts: { designers?: Designer[] } = {}) {
  const store = new MemoryStore();
  store.designers = opts.designers ?? [designer("dA", "Asha", "101"), designer("dB", "Bala", "102"), designer("dP", "Placeholder", null)];
  const hub = new MockHubSpot();
  const client = new HubSpotClient({ token: "mock", fetch: hub.fetch, sleep: async () => {}, maxRetries: 0 });
  const mailer = new FakeMailer();
  return { store, hub, client, mailer };
}

/** Runs a historical call through the real pipeline; returns the lead id. */
export async function ingest(store: MemoryStore, id: string, over: { startedAt?: Date; now?: Date; vaaniCallId?: string } = {}) {
  const golden = new GoldenExtractor();
  golden.current = id;
  const c = calls[id];
  const startedAt = over.startedAt ?? c.startedAt;
  const out = await processCall(
    { store, extractor: golden, now: () => over.now ?? startedAt },
    { vaaniCallId: over.vaaniCallId ?? `T-${id}`, callerNumber: c.callerNumber, startedAt, durationSec: c.durationSec, language: "en", callerName: null, transcript: c.transcript },
  );
  if (out.status !== "processed") throw new Error("expected processed");
  return out.leadId;
}

export const syncToHubSpot = (w: ReturnType<typeof makeWorld>, now: Date) => runOutbox({ store: w.store, client: w.client, now });

export function claimLinkFrom(mail: Mail) {
  const m = /(https?:\/\/\S+\/claim\/[^\s"<]+)/.exec(mail.text);
  if (!m) throw new Error("no claim link in email");
  const u = new URL(m[1]);
  return { leadId: u.pathname.split("/").pop()!, designerId: u.searchParams.get("d")!, token: u.searchParams.get("t")! };
}
