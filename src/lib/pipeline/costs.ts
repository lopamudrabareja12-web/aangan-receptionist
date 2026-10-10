export interface CostRates {
  voice_rate_inr_per_min: number;
  gemini_input_usd_per_m: number;
  gemini_output_usd_per_m: number;
  usd_inr: number;
}

export interface CallCost {
  voiceMinutes: number;
  voiceCostInr: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  llmCostInr: number;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Per-call cost from the configured rates. These are ESTIMATES from settings, not billing data. */
export function computeCallCost(
  input: { durationSec: number | null; inputTokens: number; outputTokens: number },
  rates: CostRates,
): CallCost {
  const voiceMinutes = round((input.durationSec ?? 0) / 60, 2);
  const llmUsd = (input.inputTokens / 1e6) * rates.gemini_input_usd_per_m + (input.outputTokens / 1e6) * rates.gemini_output_usd_per_m;
  return {
    voiceMinutes,
    voiceCostInr: round(voiceMinutes * rates.voice_rate_inr_per_min, 2),
    llmInputTokens: input.inputTokens,
    llmOutputTokens: input.outputTokens,
    llmCostInr: round(llmUsd * rates.usd_inr, 4),
  };
}

export const DEFAULT_RATES: CostRates = {
  voice_rate_inr_per_min: 5,
  gemini_input_usd_per_m: 0.3,
  gemini_output_usd_per_m: 2.5,
  usd_inr: 85,
};
