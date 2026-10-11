import { callFromRecord, processReceived, type ProcessDeps } from "./process-call";

export interface SweepSummary {
  retried: number;
  failed: number;
}

/**
 * Safety net for the "reply to Vaani first, process afterwards" design: any call that was stored but never finished
 * (the function was cut off, the AI was down) is processed again. Processing is idempotent, so this is always safe.
 */
export async function sweepStaleCalls(deps: ProcessDeps, now: Date, limit = 5, staleAfterMs = 5 * 60_000): Promise<SweepSummary> {
  const out: SweepSummary = { retried: 0, failed: 0 };
  const stale = await deps.store.listStaleCalls(new Date(now.getTime() - staleAfterMs), limit);
  for (const row of stale) {
    try {
      await processReceived(deps, row, callFromRecord(row));
      out.retried++;
    } catch {
      out.failed++; // processReceived already marked it failed; it will be picked up again next time
    }
  }
  return out;
}
