export interface CostRow {
  voiceMinutes: number;
  voiceCost: number;
  llmCost: number;
}

export interface MonthlyInputs {
  callsPerMonth: number;
  avgVoiceMinutes: number;
  avgLlmCostPerCall: number;
  voiceRatePerMin: number;
  resendMonthly: number;
  hostingMonthly: number;
  avgProjectValue: number;
  conversionRate: number; // share of forwarded leads that become projects, 0..1
}

export interface CostSummary {
  calls: number;
  voiceMinutes: number;
  voiceCost: number;
  llmCost: number;
  total: number;
  perCall: number;
  perQualifiedLead: number | null;
}

/** Totals over recorded calls. Costs were computed at the rates in force when each call was processed. */
export function summariseCosts(rows: CostRow[], qualifiedLeads: number): CostSummary {
  const voiceMinutes = rows.reduce((s, r) => s + r.voiceMinutes, 0);
  const voiceCost = rows.reduce((s, r) => s + r.voiceCost, 0);
  const llmCost = rows.reduce((s, r) => s + r.llmCost, 0);
  const total = voiceCost + llmCost;
  return { calls: rows.length, voiceMinutes, voiceCost, llmCost, total, perCall: rows.length ? total / rows.length : 0, perQualifiedLead: qualifiedLeads > 0 ? total / qualifiedLeads : null };
}

export interface BreakEven {
  monthlyCost: number;
  annualCost: number;
  /** Extra projects per year whose revenue equals the annual running cost (revenue, not profit). */
  extraProjectsPerYear: number;
  /** Extra forwarded leads per year needed to produce those projects at the given conversion rate; null if the rate is 0. */
  extraLeadsPerYear: number | null;
}

/** What the system costs per month at the given volume, and how many extra projects a year pay for it. */
export function breakEven(i: MonthlyInputs): BreakEven {
  const monthlyCost = i.callsPerMonth * (i.avgVoiceMinutes * i.voiceRatePerMin + i.avgLlmCostPerCall) + i.resendMonthly + i.hostingMonthly;
  const annualCost = monthlyCost * 12;
  const extraProjectsPerYear = i.avgProjectValue > 0 ? annualCost / i.avgProjectValue : 0;
  return { monthlyCost, annualCost, extraProjectsPerYear, extraLeadsPerYear: i.conversionRate > 0 ? extraProjectsPerYear / i.conversionRate : null };
}
