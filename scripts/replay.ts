// Usage:
//   npm run replay                         offline, hand-labelled extractions: tests rules + pipeline + HubSpot wiring
//   npm run replay -- --extractor=gemini   BILLED: sends the 18 redacted transcripts to Gemini (needs .env.local keys)
//   npm run replay -- --json               machine-readable output
import { existsSync } from "node:fs";
import { GeminiExtractor } from "@/lib/pipeline/extractor";
import { formatReport, runReplay } from "@/replay/run";
import { loadPhoneTranscripts } from "@/replay/transcripts";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const useGemini = process.argv.includes("--extractor=gemini");
  let extractor;
  if (useGemini) {
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;
    if (!key || !model) throw new Error("GEMINI_API_KEY and GEMINI_MODEL must be set in .env.local for --extractor=gemini");
    extractor = GeminiExtractor.fromApiKey(key, model);
  }
  const report = await runReplay({ calls: loadPhoneTranscripts(), extractor });
  console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
  const failed = report.rows.some((r) => !r.match) || report.invariants.some((i) => !i.ok);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
