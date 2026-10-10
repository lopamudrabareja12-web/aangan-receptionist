import { cacheLife } from "next/cache";
import { runReplay, type ReplayReport } from "@/replay/run";
import { loadPhoneTranscripts, type ReplayCall } from "@/replay/transcripts";
import { istDate } from "@/lib/pipeline/rubric";

// Dashboard numbers computed from the 20 HISTORICAL September phone enquiries (a replay through the real pipeline).
// These are NOT live calls and are never mixed with live data. Every rate below is an assumption shown on the page.

export const ASSUMPTIONS = {
  voiceRateInrPerMin: 5.51, // Vaani's own estimate shown on the agent page (₹5.51/min); confirm on the invoice
  geminiInputUsdPerM: 0.3, // listed price for gemini-3.5-flash-lite (third-party sources; confirm on Google's page)
  geminiOutputUsdPerM: 2.5,
  usdInr: 85, // placeholder exchange rate
  // measured on the real-model replay of the 18 calls that reach the AI step
  measuredGeminiTokens: { calls: 18, input: 10_258, output: 6_310 },
  avgProjectValueInr: 1_100_000, // midpoint of ₹8-14 lakh
  hubspotSeatUsdPerMonth: 7, // Starter seat price shown in HubSpot; the free plan allows 2 users
  designerSeatsForRollout: 14,
  enquiriesPerMonth: 200, // from the case brief
  phoneShareOfEnquiries: 0.5, // assumption
};

export interface LeadRow {
  id: string;
  when: string;
  afterHours: boolean;
  durationMin: number;
  decision: string;
  reason: string | null;
  flags: string[];
  stage: string | null;
  note: string;
}

export interface DashboardData {
  report: ReplayReport;
  rows: LeadRow[];
  counts: { enquiries: number; forwarded: number; declined: number; deferred: number; escalated: number; incomplete: number };
  afterHoursShare: number;
  forwardedValue: number;
  cost: { voiceMinutes: number; voice: number; gemini: number; perEnquiry: number; perForwardedLead: number };
  monthly: { calls: number; voice: number; gemini: number; seats: number; demoTotal: number; rolloutTotal: number };
  breakEvenProjectsPerYear: { demo: number; rollout: number };
}

const istHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(d));
const whenIst = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(d);

export async function buildDashboard(): Promise<DashboardData> {
  "use cache"; // computed once and cached: the replay is deterministic and uses random ids internally
  cacheLife("max"); // keep the build-time result; the transcript file is only guaranteed to exist at build time
  const calls: ReplayCall[] = loadPhoneTranscripts();
  const report = await runReplay({ calls });
  const A = ASSUMPTIONS;
  const rows: LeadRow[] = report.rows.map((r) => {
    const call = calls.find((c) => c.id === (r.id === "T17" ? "T17b" : r.id))!;
    const h = istHour(call.startedAt);
    return {
      id: r.id, when: whenIst(call.startedAt), afterHours: h < 10 || h >= 19, durationMin: call.durationSec / 60,
      decision: r.actual.decision, reason: r.actual.reasonCode, flags: r.actual.flags, stage: r.actual.stage, note: r.expected,
    };
  });
  const n = (f: (r: LeadRow) => boolean) => rows.filter(f).length;
  const counts = {
    enquiries: rows.length,
    forwarded: n((r) => r.decision === "qualified" || r.decision === "qualified_flagged"),
    declined: n((r) => r.decision === "declined"),
    deferred: n((r) => r.decision === "deferred"),
    escalated: n((r) => r.decision === "escalation"),
    incomplete: n((r) => r.decision === "incomplete"),
  };
  const voiceMinutes = calls.reduce((s, c) => s + c.durationSec / 60, 0);
  const voice = voiceMinutes * A.voiceRateInrPerMin;
  const tok = A.measuredGeminiTokens;
  const geminiPerCall = (((tok.input / tok.calls) * A.geminiInputUsdPerM + (tok.output / tok.calls) * A.geminiOutputUsdPerM) / 1e6) * A.usdInr;
  const gemini = geminiPerCall * tok.calls;
  const totalCost = voice + gemini;
  const avgMinPerCall = voiceMinutes / calls.length;
  const callsPerMonth = A.enquiriesPerMonth * A.phoneShareOfEnquiries;
  const monthlyVoice = callsPerMonth * avgMinPerCall * A.voiceRateInrPerMin;
  const monthlyGemini = callsPerMonth * geminiPerCall;
  const seats = A.designerSeatsForRollout * A.hubspotSeatUsdPerMonth * A.usdInr;
  const demoTotal = monthlyVoice + monthlyGemini;
  const rolloutTotal = demoTotal + seats;
  return {
    report, rows, counts,
    afterHoursShare: n((r) => r.afterHours) / rows.length,
    forwardedValue: counts.forwarded * A.avgProjectValueInr,
    cost: { voiceMinutes, voice, gemini, perEnquiry: totalCost / rows.length, perForwardedLead: totalCost / Math.max(1, counts.forwarded) },
    monthly: { calls: callsPerMonth, voice: monthlyVoice, gemini: monthlyGemini, seats, demoTotal, rolloutTotal },
    breakEvenProjectsPerYear: { demo: (demoTotal * 12) / A.avgProjectValueInr, rollout: (rolloutTotal * 12) / A.avgProjectValueInr },
  };
}

export const inr = (v: number): string => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} crore`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} lakh`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
};
export { istDate };
