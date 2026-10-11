import { describe, it, expect } from "vitest";
import { claimUrl, makeClaimToken, verifyClaimToken } from "@/lib/claim-token";
import { assignedEmail, handoffEmail, nikhilAlertEmail } from "@/lib/mail/emails";
import { MailError, ResendMailer } from "@/lib/mail/resend";
import { addWorkingMinutes, nextWorkingStart } from "@/lib/time";
import { fakeHubSpot } from "../hubspot/fake";

const ist = (s: string) => new Date(new Date(`${s}Z`).getTime() - 5.5 * 3600_000); // "2026-09-02T10:23" as IST
const show = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);

describe("working-hours maths (studio open 10:00-19:00 IST)", () => {
  it("adds minutes inside the day", () => {
    expect(show(addWorkingMinutes(ist("2026-09-02T10:23"), 15))).toBe("2026-09-02T10:38");
  });
  it("a call after closing counts from 10:00 the next morning", () => {
    expect(show(addWorkingMinutes(ist("2026-09-02T22:47"), 15))).toBe("2026-09-03T10:15");
    expect(show(nextWorkingStart(ist("2026-09-02T22:47")))).toBe("2026-09-03T10:00");
  });
  it("a call before opening counts from 10:00 the same day", () => {
    expect(show(addWorkingMinutes(ist("2026-09-02T07:30"), 15))).toBe("2026-09-02T10:15");
  });
  it("time after 19:00 does not count: notified at 18:55 with 15 minutes runs to 10:10 next day", () => {
    expect(show(addWorkingMinutes(ist("2026-09-02T18:55"), 15))).toBe("2026-09-03T10:10");
  });
  it("exactly filling the day ends at 19:00", () => {
    expect(show(addWorkingMinutes(ist("2026-09-02T18:45"), 15))).toBe("2026-09-02T19:00");
  });
});

describe("claim links", () => {
  const secret = "s".repeat(32);
  it("verify only for the exact lead and designer they were made for", () => {
    const t = makeClaimToken(secret, "lead1", "dA");
    expect(verifyClaimToken(secret, "lead1", "dA", t)).toBe(true);
    expect(verifyClaimToken(secret, "lead2", "dA", t)).toBe(false);
    expect(verifyClaimToken(secret, "lead1", "dB", t)).toBe(false);
    expect(verifyClaimToken("x".repeat(32), "lead1", "dA", t)).toBe(false);
    expect(verifyClaimToken(secret, "lead1", "dA", t.slice(0, -2) + "zz")).toBe(false);
    expect(verifyClaimToken(secret, "lead1", "dA", "")).toBe(false);
    expect(verifyClaimToken("", "lead1", "dA", t)).toBe(false);
  });
  it("builds a URL carrying lead, designer and token", () => {
    const u = new URL(claimUrl("https://x.test/", secret, "lead1", "dA"));
    expect(u.pathname).toBe("/claim/lead1");
    expect(u.searchParams.get("d")).toBe("dA");
    expect(verifyClaimToken(secret, "lead1", "dA", u.searchParams.get("t"))).toBe(true);
  });
});

describe("ResendMailer", () => {
  const mk = (routes: Parameters<typeof fakeHubSpot>[0]) => {
    const f = fakeHubSpot(routes);
    const sleeps: number[] = [];
    return { m: new ResendMailer({ apiKey: "re_SECRET_KEY", from: "Aangan <a@x.test>", fetch: f.fetchFn, sleep: async (ms) => void sleeps.push(ms) }), calls: f.calls, sleeps };
  };
  it("posts the email with the key in the header and an idempotency key", async () => {
    const { m, calls } = mk({ "POST /emails": () => ({ body: { id: "e1" } }) });
    expect(await m.send({ to: "a@x.test", subject: "S", text: "t", html: "<p>t</p>", idempotencyKey: "k1" })).toEqual({ id: "e1" });
    expect(calls[0].auth).toBe("Bearer re_SECRET_KEY");
    expect(calls[0].body).toMatchObject({ from: "Aangan <a@x.test>", to: ["a@x.test"], subject: "S" });
  });
  it("retries a rate limit then succeeds", async () => {
    const { m, calls, sleeps } = mk({ "POST /emails": [() => ({ status: 429, headers: { "retry-after": "1" } }), () => ({ body: { id: "e2" } })] });
    expect((await m.send({ to: "a@x.test", subject: "S", text: "t", html: "t" })).id).toBe("e2");
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });
  it("a rejected address fails at once, and the error never contains the API key", async () => {
    const { m, calls } = mk({ "POST /emails": () => ({ status: 403, body: { message: "You can only send to your own address" } }) });
    const err = (await m.send({ to: "x@y.test", subject: "S", text: "t", html: "t" }).then(() => null, (e: unknown) => e)) as MailError;
    expect(err).toBeInstanceOf(MailError);
    expect(err.message).toContain("own address");
    expect(err.message).not.toContain("re_SECRET_KEY");
    expect(calls).toHaveLength(1);
  });
});

describe("email content", () => {
  const base = { subject: "New enquiry: Priya · 3BHK · Kothrud", noteText: "Caller: Priya", noteHtml: "<p>Caller: Priya</p>", leadId: "L1" };
  it("handoff email carries the claim link, the note, the deadline, and a per-designer idempotency key", () => {
    const m = handoffEmail({ ...base, to: "a@x.test", designerName: "Asha", claimUrl: "https://x.test/claim/L1?d=dA&t=abc", timeoutMinutes: 15 });
    expect(m.text).toContain("https://x.test/claim/L1?d=dA&t=abc");
    expect(m.text).toContain("15 working minutes");
    expect(m.html).toContain("Open and claim this lead");
    expect(m.html).toContain("<p>Caller: Priya</p>");
    expect(m.idempotencyKey).toBe("handoff:L1:a@x.test");
  });
  it("escapes a designer name that contains HTML", () => {
    const m = handoffEmail({ ...base, to: "a@x.test", designerName: "<script>x</script>", claimUrl: "https://x.test", timeoutMinutes: 15 });
    expect(m.html).not.toContain("<script>");
  });
  it("Nikhil's alerts say why, and never contain a price figure", () => {
    for (const kind of ["vip", "escalation", "auto_assigned", "no_designers"] as const) {
      const m = nikhilAlertEmail({ ...base, to: "n@x.test", kind });
      expect(m.subject.length).toBeGreaterThan(10);
      expect(m.text + m.html).not.toMatch(/per sq ?ft|₹\s?1,800|2,400|3,500/);
      expect(m.idempotencyKey).toBe(`nikhil:${kind}:L1`);
    }
    expect(nikhilAlertEmail({ ...base, to: "n@x.test", kind: "escalation" }).subject).toMatch(/^ESCALATION/);
  });
  it("auto-assignment email tells the designer it is already on their name", () => {
    expect(assignedEmail({ ...base, to: "a@x.test", designerName: "Asha" }).text).toContain("already on your name in HubSpot");
  });
});
