import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { HELD_OUT, PROMPT_EXAMPLES } from "@/replay/split";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const packFiles = ["voice-agent/prompt.md", "voice-agent/greeting.md", "voice-agent/SETUP.md", ...readdirSync(path.join(root, "voice-agent/knowledge")).map((f) => `voice-agent/knowledge/${f}`)];
const prompt = read("voice-agent/prompt.md");
const body = prompt.slice(prompt.indexOf("\n---\n"));

describe("voice agent pack: the Cut (no price anywhere)", () => {
  it("contains none of the figures from the internal pricing guide", () => {
    const pricing = read("source/pricing.md");
    const figures = [...pricing.matchAll(/(?:₹\s?)?\d[\d,]*(?:\.\d+)?(?:\+| lakh)?/g)].map((m) => m[0].replace(/^₹\s?/, "").trim()).filter((f) => /\d{3,}|lakh/.test(f));
    expect(figures.length).toBeGreaterThan(5); // the guide really has figures to guard against
    for (const f of new Set(figures)) {
      for (const file of packFiles) expect(read(file), `${file} must not contain "${f}"`).not.toContain(f);
    }
  });
  it("has no currency symbols, 'lakh' or 'crore', and no 'starting at' or 'rate card' language, anywhere in the pack", () => {
    for (const file of packFiles) {
      const t = read(file);
      expect(t, file).not.toMatch(/₹|\bRs\.?\s?\d|\blakhs?\b|\bcrores?\b|starting (at|from)|rate card/i);
    }
  });
  it("the only mention of per-square-foot pricing is a prohibition or a refusal", () => {
    for (const file of packFiles) {
      for (const line of read(file).split("\n").filter((l) => /per[- ]square[- ]foot|per sq/i.test(l))) {
        expect(line, `${file}: ${line}`).toMatch(/never|no figures|not shared|not|cannot/i);
      }
    }
  });
});

describe("voice agent prompt: required behaviour", () => {
  it("contains the exact approved pricing reply, with a reason and the free no-obligation next step", () => {
    expect(body).toContain("Pricing depends on the site, the materials you choose, and the scope. Your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.");
    expect(body).toMatch(/free[^.]*no obligation|no obligation/i);
    expect(body).toMatch(/misleading/);
  });
  it("tells callers it is an AI that may be recorded, in the greeting", () => {
    const g = read("voice-agent/greeting.md");
    expect(g).toMatch(/AI assistant/);
    expect(g).toMatch(/may be recorded/);
    expect(g).toMatch(/नमस्ते/);
    expect(body).toMatch(/never pretend to be a person/i);
  });
  it("speaks English and Hindi and replies in the caller's language", () => {
    expect(body).toMatch(/English or Hindi/);
    expect(body).toMatch(/language the caller uses/i);
  });
  it("asks ONE question at a time and repeats numbers back", () => {
    expect(body).toMatch(/One question at a time/i);
    expect(body).toMatch(/repeat back every size, place and date/i);
  });
  it("asks every must-have field", () => {
    for (const k of [/name/i, /where the site is/i, /Type of place/i, /Carpet area/i, /Whole place, or only some rooms/i, /furniture/i, /storage, wardrobe or kitchen/i, /structural work/i, /State of the property/i, /finished|could start/i, /decision-maker/i, /attend/i, /heard about Aangan/i]) {
      expect(body).toMatch(k);
    }
  });
  it("never asks about colours, style, materials or budget", () => {
    expect(body).toMatch(/NEVER ask about colours, style or materials/);
    expect(body).toMatch(/Never ask about budget/);
  });
  it("never promises a callback minute; promises working hours only", () => {
    expect(body).toMatch(/NEVER promise a specific time for a callback/);
    expect(body).toMatch(/ten in the morning to seven in the evening/);
  });
  it("sends complaints to a senior within fifteen minutes and treats them as not a new enquiry", () => {
    expect(body).toMatch(/senior person will call you back within fifteen minutes/);
    expect(body).toMatch(/do not treat this as a new enquiry/i);
  });
  it("declines with a reason, no blame, an alternative and an open door", () => {
    expect(body).toMatch(/give the reason/i);
    expect(body).toMatch(/never blame the caller/i);
    expect(body).toMatch(/alternative/i);
    expect(body).toMatch(/door open/i);
  });
  it("summarises and confirms before ending", () => {
    expect(body).toMatch(/summarise/i);
    expect(body).toMatch(/Is that all correct/i);
  });
  it("lists every hard decline and the non-reasons to decline", () => {
    for (const k of [/restaurants, hotels, retail stores, gyms/i, /Talegaon, Lonavala, Nashik, Mumbai/i, /Vastu advice only/i, /structural or civil work only/i, /rented flat/i, /calling at night/i]) expect(body).toMatch(k);
  });
});

describe("few-shot examples come only from the prompt-example half of the transcripts", () => {
  const ids = [...prompt.matchAll(/adapted from call (T\d{2})/g)].map((m) => m[1]);
  it("uses four or five examples", () => {
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids.length).toBeLessThanOrEqual(5);
  });
  it("every example is a prompt-example call and none is held out", () => {
    for (const id of ids) {
      expect(PROMPT_EXAMPLES as readonly string[]).toContain(id);
      expect(HELD_OUT as readonly string[]).not.toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("no held-out call id is mentioned anywhere in the prompt", () => {
    for (const id of HELD_OUT) expect(prompt).not.toContain(id);
  });
});
