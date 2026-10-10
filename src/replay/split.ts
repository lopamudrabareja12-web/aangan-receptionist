// About half of the 20 calls are PROMPT EXAMPLES (they may be used as few-shot examples in the voice agent prompt,
// Phase 5). The other half are HELD OUT: never shown to any prompt, so they test generalisation, not memory.
// Every rule category appears in both halves.

export const PROMPT_EXAMPLES = ["T01", "T02", "T03", "T06", "T07", "T09", "T10", "T12", "T19", "T20"] as const;
export const HELD_OUT = ["T04", "T05", "T08", "T11", "T13", "T14", "T15", "T16", "T17", "T18"] as const;

export type Group = "example" | "held_out";
export const groupOf = (baseId: string): Group => ((PROMPT_EXAMPLES as readonly string[]).includes(baseId) ? "example" : "held_out");
