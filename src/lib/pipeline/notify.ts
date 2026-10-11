import { claimUrl } from "@/lib/claim-token";
import { assignedEmail, handoffEmail, nikhilAlertEmail, type NikhilAlertKind } from "@/lib/mail/emails";
import type { Mailer } from "@/lib/mail/resend";
import { addWorkingMinutes } from "@/lib/time";
import type { Assignment, Designer, PipelineStore } from "./store";

export interface NotifyDeps {
  store: PipelineStore;
  mailer: Mailer;
  now: Date;
  baseUrl: string;
  secret: string;
  nikhilEmail: string;
  timeoutMinutes: number;
}

/** Designers who can receive and own a lead: on duty AND linked to a HubSpot owner (so a claim can set the deal owner). */
export const claimable = (designers: Designer[]) => designers.filter((d) => d.onDuty && d.hubspotOwnerId);

async function alertNikhil(d: NotifyDeps, kind: NikhilAlertKind, a: Assignment, detail?: string) {
  await d.mailer.send(nikhilAlertEmail({ to: d.nikhilEmail, kind, subject: a.subject, noteText: a.noteText, noteHtml: a.noteHtml, leadId: a.leadId, detail }));
}

export interface NotifySummary {
  designerEmails: number;
  nikhilEmails: number;
  notified: number;
  waiting: number;
  errors: string[];
}

/**
 * Emails the people who need to know about each lead whose time has come:
 *  - complaints: Nikhil, immediately;
 *  - new qualified leads: every on-duty designer, each with their own claim link, then the claim clock starts;
 *  - VIP leads: Nikhil too.
 * Safe to run every minute: each email is sent at most once (recorded per designer, plus Resend's idempotency key).
 */
export async function runNotifications(d: NotifyDeps): Promise<NotifySummary> {
  const out: NotifySummary = { designerEmails: 0, nikhilEmails: 0, notified: 0, waiting: 0, errors: [] };
  const due = await d.store.listDueNotifications(d.now);
  const designers = claimable(await d.store.listDesigners());

  for (const a of due) {
    try {
      if (a.kind === "escalation") {
        if (!a.nikhilAlertedAt) {
          await alertNikhil(d, "escalation", a);
          await d.store.markNikhilAlerted(a.leadId, d.now);
          out.nikhilEmails++;
        }
        await d.store.markNotified(a.leadId, d.now, null);
        out.notified++;
        continue;
      }

      if (designers.length === 0) {
        if (!a.nikhilAlertedAt) {
          await alertNikhil(d, "no_designers", a);
          await d.store.markNikhilAlerted(a.leadId, d.now);
          out.nikhilEmails++;
        }
        out.waiting++;
        continue;
      }

      const already = new Set((await d.store.listEvents(a.leadId, "email_sent")).map((e) => (e.detail as { designerId?: string })?.designerId));
      let failed = false;
      for (const designer of designers) {
        if (already.has(designer.id)) continue;
        try {
          const sent = await d.mailer.send(
            handoffEmail({
              to: designer.email, designerName: designer.name, subject: a.subject, noteText: a.noteText, noteHtml: a.noteHtml,
              claimUrl: claimUrl(d.baseUrl, d.secret, a.leadId, designer.id), timeoutMinutes: d.timeoutMinutes, leadId: a.leadId,
            }),
          );
          await d.store.addEvent(a.leadId, "email_sent", { designerId: designer.id, to: designer.email, id: sent.id });
          out.designerEmails++;
        } catch (e) {
          failed = true;
          out.errors.push(`${designer.email}: ${e instanceof Error ? e.message : "send failed"}`);
        }
      }
      if (failed) {
        out.waiting++; // the claim clock only starts once every designer has the email
        continue;
      }
      const deadline = addWorkingMinutes(d.now, d.timeoutMinutes);
      if (await d.store.markNotified(a.leadId, d.now, deadline)) {
        out.notified++;
        if (a.isVip && !a.nikhilAlertedAt) {
          await alertNikhil(d, "vip", a);
          await d.store.markNikhilAlerted(a.leadId, d.now);
          out.nikhilEmails++;
        }
      }
    } catch (e) {
      out.errors.push(`lead ${a.leadId}: ${e instanceof Error ? e.message : "failed"}`);
      out.waiting++;
    }
  }
  return out;
}

export interface AssignDeps extends NotifyDeps {
  /** Open deals an owner currently has in HubSpot; may throw if HubSpot is down. */
  openDeals: (ownerId: string) => Promise<number>;
  rng?: () => number;
}

export interface AssignSummary {
  assigned: number;
  skipped: number;
  errors: string[];
}

/** Picks the designer with the fewest open deals (random among ties). */
export async function pickDesigner(candidates: Designer[], openDeals: (ownerId: string) => Promise<number>, rng: () => number = Math.random): Promise<Designer> {
  const counted = await Promise.all(
    candidates.map(async (c) => {
      try {
        return { c, n: await openDeals(c.hubspotOwnerId as string) };
      } catch {
        return { c, n: Number.POSITIVE_INFINITY }; // HubSpot unreachable for this one: treat as unknown, fall back below
      }
    }),
  );
  const known = counted.filter((x) => Number.isFinite(x.n));
  const pool = known.length ? known : counted;
  const min = Math.min(...pool.map((x) => x.n));
  const ties = pool.filter((x) => x.n === min);
  return ties[Math.floor(rng() * ties.length) % ties.length].c;
}

/** Leads nobody claimed before the deadline get an owner automatically, and Nikhil is told. */
export async function runAutoAssign(d: AssignDeps, enqueue: (a: Assignment, designer: Designer) => Promise<void>): Promise<AssignSummary> {
  const out: AssignSummary = { assigned: 0, skipped: 0, errors: [] };
  const overdue = await d.store.listOverdueClaims(d.now);
  const designers = claimable(await d.store.listDesigners());
  for (const a of overdue) {
    try {
      if (designers.length === 0 || !a.hubspotDealId) {
        if (!a.nikhilAlertedAt) {
          await alertNikhil(d, "no_designers", a);
          await d.store.markNikhilAlerted(a.leadId, d.now);
        }
        out.skipped++;
        continue;
      }
      const chosen = await pickDesigner(designers, d.openDeals, d.rng);
      if (!(await d.store.claimLead(a.leadId, chosen.id, "auto", d.now))) continue; // someone claimed in the meantime
      await enqueue(a, chosen);
      await d.mailer.send(assignedEmail({ to: chosen.email, designerName: chosen.name, subject: a.subject, noteText: a.noteText, noteHtml: a.noteHtml, leadId: a.leadId }));
      await alertNikhil(d, "auto_assigned", a, `Assigned to ${chosen.name}.`);
      await d.store.markNikhilAlerted(a.leadId, d.now);
      out.assigned++;
    } catch (e) {
      out.errors.push(`lead ${a.leadId}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return out;
}
