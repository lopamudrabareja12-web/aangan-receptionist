// Usage:
//   npm run replay                         offline, hand-labelled extractions: tests rules + pipeline + HubSpot wiring
//   npm run replay -- --extractor=gemini   BILLED: sends the 18 redacted transcripts to Gemini (needs .env.local keys)
//   npm run replay -- --extractor=gemini --model=gemini-2.5-flash-lite   choose the model (default: GEMINI_MODEL in .env.local)
//   npm run replay -- --extractor=gemini --delay=7000                    pause between calls, for free-tier rate limits (default 7000 ms)
//   npm run replay -- --json               machine-readable output
import { existsSync } from "node:fs";
import { GeminiExtractor, type Extractor } from "@/lib/pipeline/extractor";
import { formatReport, runReplay } from "@/replay/run";
import { loadPhoneTranscripts } from "@/replay/transcripts";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const useGemini = process.argv.includes("--extractor=gemini");
  let extractor: Extractor | undefined;
  if (useGemini) {
    const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
    const key = process.env.GEMINI_API_KEY;
    const model = arg("model") ?? process.env.GEMINI_MODEL;
    const delay = Number(arg("delay") ?? 7000);
    if (!key || !model) throw new Error("GEMINI_API_KEY and GEMINI_MODEL must be set in .env.local for --extractor=gemini");
    const real = GeminiExtractor.fromApiKey(key, model);
    console.error(`Gemini model: ${model} (pausing ${delay} ms between calls)`);
    extractor = { extract: async (i) => { await new Promise((r) => setTimeout(r, delay)); return real.extract(i); } };
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
