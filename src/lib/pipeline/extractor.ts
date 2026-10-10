import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ExtractionSchema, type Extraction } from "./extraction-schema";

export interface ExtractionResult {
  extraction: Extraction;
  usage: { inputTokens: number; outputTokens: number };
}

export interface Extractor {
  extract(input: { redactedTranscript: string; callDate: string }): Promise<ExtractionResult>;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type GenerateFn = (prompt: string, jsonSchema: unknown) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

export const SYSTEM_PROMPT = `You read the transcript of ONE phone call to Aangan Studio, an interior design studio in Pune, and fill in a JSON record.
Rules:
- Use only what is said in the call. If something is not said, use null (or "unknown"). Never guess.
- Never output a person's name or a phone number. In "summary", refer to "the caller".
- ready_by_date is the date the project must be FINISHED or moved into. A possession date is not a deadline. Resolve relative dates ("by March", "before Diwali") against the call date; for a month, use its last day, in the next such month after the call date.
- budget_volunteered_inr only if the caller states a budget; convert lakh to rupees (1 lakh = 100000). If a range is given, use the upper end.
- price_asked is true if the caller asked what the work would cost, even if the agent declined to say.
- is_vip_referral is true only for a referral from a close friend or associate of the founder, Nikhil.
- The agent may deflect price questions; that does not change the other fields.
The transcript may be in English, Hindi or a mix; answer in English.`;

export function buildPrompt(redactedTranscript: string, callDate: string): string {
  return `${SYSTEM_PROMPT}\n\nCall date (Asia/Kolkata): ${callDate}\n\nTRANSCRIPT:\n${redactedTranscript}`;
}

export class GeminiExtractor implements Extractor {
  constructor(private readonly generate: GenerateFn) {}

  /** Builds an extractor on the billed Gemini API. The key and model come from the environment, never from code. */
  static fromApiKey(apiKey: string, model: string): GeminiExtractor {
    const ai = new GoogleGenAI({ apiKey });
    return new GeminiExtractor(async (prompt, jsonSchema) => {
      const r = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0 },
      });
      return {
        text: r.text ?? "",
        inputTokens: r.usageMetadata?.promptTokenCount ?? 0,
        // thinking tokens are billed as output
        outputTokens: (r.usageMetadata?.candidatesTokenCount ?? 0) + (r.usageMetadata?.thoughtsTokenCount ?? 0),
      };
    });
  }

  async extract(input: { redactedTranscript: string; callDate: string }): Promise<ExtractionResult> {
    const schema = z.toJSONSchema(ExtractionSchema);
    let prompt = buildPrompt(input.redactedTranscript, input.callDate);
    let inputTokens = 0;
    let outputTokens = 0;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await this.generate(prompt, schema);
      inputTokens += out.inputTokens;
      outputTokens += out.outputTokens;
      try {
        const extraction = ExtractionSchema.parse(JSON.parse(out.text));
        return { extraction, usage: { inputTokens, outputTokens } };
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 300) : "invalid output";
        prompt = `${buildPrompt(input.redactedTranscript, input.callDate)}\n\nYour previous answer was invalid (${lastError}). Reply with valid JSON only.`;
      }
    }
    throw new ExtractionError(`Model output did not match the schema after 2 attempts: ${lastError}`);
  }
}
