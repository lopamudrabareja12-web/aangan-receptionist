import type { Mail } from "./resend";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wrap = (inner: string) =>
  `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1b1f27;line-height:1.5">${inner}</div>`;

const button = (url: string, label: string) =>
  `<p><a href="${esc(url)}" style="display:inline-block;background:#14161a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

/** Email to each on-duty designer: the full handoff note plus their personal claim link. */
export function handoffEmail(i: { to: string; designerName: string; subject: string; noteText: string; noteHtml: string; claimUrl: string; timeoutMinutes: number; leadId: string }): Mail {
  const intro = `Hi ${i.designerName}, a new enquiry is waiting. The first designer to claim it owns it. If nobody claims it within ${i.timeoutMinutes} working minutes it is assigned automatically.`;
  return {
    to: i.to,
    subject: i.subject,
    idempotencyKey: `handoff:${i.leadId}:${i.to}`,
    text: `${intro}\n\nClaim it: ${i.claimUrl}\n\n${i.noteText}`,
    html: wrap(`<p>${esc(intro)}</p>${button(i.claimUrl, "Open and claim this lead")}<hr style="border:none;border-top:1px solid #dfe3ea">${i.noteHtml}`),
  };
}

export type NikhilAlertKind = "vip" | "escalation" | "auto_assigned" | "no_designers";

const KIND: Record<NikhilAlertKind, { subject: string; lead: string }> = {
  vip: { subject: "VIP enquiry", lead: "A VIP enquiry has come in and designers have been emailed." },
  escalation: { subject: "ESCALATION: existing-client complaint", lead: "This is not a new enquiry. A senior person needs to call back within 15 minutes." },
  auto_assigned: { subject: "Unclaimed lead was auto-assigned", lead: "Nobody claimed this lead in time, so it was assigned automatically." },
  no_designers: { subject: "No designer on duty for a new lead", lead: "A qualified lead is waiting but no designer is on duty and linked to HubSpot." },
};

export function nikhilAlertEmail(i: { to: string; kind: NikhilAlertKind; subject: string; noteText: string; noteHtml: string; leadId: string; detail?: string }): Mail {
  const k = KIND[i.kind];
  const lead = `${k.lead}${i.detail ? ` ${i.detail}` : ""}`;
  return {
    to: i.to,
    subject: `${k.subject}: ${i.subject}`,
    idempotencyKey: `nikhil:${i.kind}:${i.leadId}`,
    text: `${lead}\n\n${i.noteText}`,
    html: wrap(`<p><strong>${esc(lead)}</strong></p><hr style="border:none;border-top:1px solid #dfe3ea">${i.noteHtml}`),
  };
}

/** Email to the designer who was auto-assigned. */
export function assignedEmail(i: { to: string; designerName: string; subject: string; noteText: string; noteHtml: string; leadId: string }): Mail {
  const intro = `Hi ${i.designerName}, you have been assigned this lead because nobody claimed it in time. It is already on your name in HubSpot. Please call the enquirer back.`;
  return {
    to: i.to,
    subject: `Assigned to you: ${i.subject}`,
    idempotencyKey: `assigned:${i.leadId}:${i.to}`,
    text: `${intro}\n\n${i.noteText}`,
    html: wrap(`<p>${esc(intro)}</p><hr style="border:none;border-top:1px solid #dfe3ea">${i.noteHtml}`),
  };
}
