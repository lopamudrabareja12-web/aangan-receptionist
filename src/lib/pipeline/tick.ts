import type { HubSpotClient } from "@/lib/hubspot/client";
import { countOpenDeals, resolveStageIds } from "@/lib/hubspot/crm";
import { PIPELINE_LABEL } from "@/lib/hubspot/stages";
import type { Mailer } from "@/lib/mail/resend";
import { enqueueClaim } from "./claim";
import type { Extractor } from "./extractor";
import { runAutoAssign, runNotifications } from "./notify";
import type { PipelineStore } from "./store";
import { sweepStaleCalls } from "./sweep";
import { runOutbox } from "./sync";

export interface TickDeps {
  store: PipelineStore;
  now: Date;
  baseUrl: string;
  claimSecret: string;
  nikhilEmail?: string;
  extractor?: Extractor;
  hubspot?: HubSpotClient;
  mailer?: Mailer;
  rng?: () => number;
}

/**
 * One pass of all the background jobs, meant to run every minute:
 *  1. reprocess calls that were stored but never finished,
 *  2. push queued writes to HubSpot,
 *  3. email whoever is due to be told,
 *  4. auto-assign leads nobody claimed in time, then push those owner changes to HubSpot.
 * A missing service (no email key yet, say) skips only its own step and is reported, never crashes the rest.
 */
export async function runTick(d: TickDeps): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const skipped: string[] = [];
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message.slice(0, 200) : "failed"}`);
    }
  };
  const settings = await d.store.getSettings();

  if (d.extractor) await step("sweep", () => sweepStaleCalls({ store: d.store, extractor: d.extractor!, now: () => d.now }, d.now));
  else skipped.push("sweep (no AI key)");

  if (d.hubspot) await step("outbox", () => runOutbox({ store: d.store, client: d.hubspot!, now: d.now }));
  else skipped.push("HubSpot sync (no HubSpot key)");

  if (d.mailer && d.nikhilEmail) {
    const base = { store: d.store, mailer: d.mailer, now: d.now, baseUrl: d.baseUrl, secret: d.claimSecret, nikhilEmail: d.nikhilEmail, timeoutMinutes: settings.claim_timeout_minutes };
    await step("notify", () => runNotifications(base));
    if (d.hubspot) {
      await step("assign", async () => {
        const { pipelineId } = await resolveStageIds(d.hubspot!, PIPELINE_LABEL);
        return runAutoAssign({ ...base, openDeals: (ownerId) => countOpenDeals(d.hubspot!, ownerId, pipelineId), rng: d.rng }, (a, designer) =>
          enqueueClaim(d.store, a, designer, "auto", d.now),
        );
      });
      await step("outbox_after_assign", () => runOutbox({ store: d.store, client: d.hubspot!, now: d.now }));
    } else skipped.push("auto-assign (no HubSpot key)");
  } else skipped.push("emails and auto-assign (no email key or NIKHIL_EMAIL)");

  out.skipped = skipped;
  out.errors = errors;
  return out;
}
