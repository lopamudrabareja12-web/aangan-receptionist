// Hard rule 7: caller identifiers stay out of Gemini inputs. Phone numbers and emails are removed by pattern;
// the caller's own name is removed wherever it appears. Names of OTHER people (a referrer, an existing designer)
// are NOT removed: the referral source is a field we need. This limit is documented in the README.

const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\b\d{10,}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

const NAME_CUE = /(?:[Mm]y name is|[Tt]his is|I['’]m|I am|i['’]m|i am)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)/;

/** Best-effort caller name from the caller's own lines (cue words + capitalised words). Null if not found. */
export function guessCallerName(transcript: string): string | null {
  for (const line of transcript.split("\n")) {
    if (!/^caller:/i.test(line)) continue;
    const m = NAME_CUE.exec(line.replace(/^caller:\s*/i, ""));
    if (m) return m[1];
  }
  return null;
}

export function redactForLlm(transcript: string, callerName: string | null): { text: string; redactions: number } {
  let redactions = 0;
  const count = (re: RegExp, repl: string) => (text: string) =>
    text.replace(re, () => {
      redactions++;
      return repl;
    });
  let text = transcript;
  text = count(EMAIL, "[EMAIL]")(text);
  text = count(PHONE, "[PHONE]")(text);
  if (callerName) {
    for (const part of callerName.split(/\s+/).filter((p) => p.length >= 3)) {
      const esc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = count(new RegExp(`\\b${esc}\\b`, "gi"), "[CALLER]")(text);
    }
  }
  return { text, redactions };
}
