import { readFileSync } from "node:fs";
import path from "node:path";

// Parses the T-series (phone) transcripts from source/enquiries.txt into call records.
// These are HISTORICAL calls handled by the human front desk in September 2026. They are test data only.
// Outcome notes written by the front desk ("Note: ...", "ESCALATE", "MISSED CALL" details) are NOT part of the
// transcript we feed the system: that would leak the answer.

export interface ReplayCall {
  id: string;            // T01 .. T20, with a/b suffix when one entry holds two calls (T17)
  baseId: string;        // T01 .. T20
  startedAt: Date;
  durationSec: number;
  callerNumber: string;  // SYNTHETIC: the source numbers were anonymised
  transcript: string;
}

const MONTHS: Record<string, number> = { september: 9 };
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function startTime(day: number, month: string, time: string): Date {
  const m = /^(\d{1,2}):(\d{2})(am|pm)$/i.exec(time);
  if (!m) throw new Error(`Bad time: ${time}`);
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return new Date(Date.UTC(2026, MONTHS[month.toLowerCase()] - 1, day, h, Number(m[2])) - IST_OFFSET_MS);
}

const duration = (min: string, sec: string) => Number(min) * 60 + Number(sec);

export function parsePhoneTranscripts(text: string): ReplayCall[] {
  const section = text.split(/SECTION 2/)[0];
  const blocks = section.split(/\n(?=T\d{2} · Phone)/).filter((b) => /^T\d{2} · Phone/.test(b));
  const out: ReplayCall[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const head = /^(T\d{2}) · Phone · (\d{1,2}) (\w+) · (\d{1,2}:\d{2}(?:am|pm))(?: then (\d{1,2}:\d{2}(?:am|pm)))?(?: · (?:(\d+) min (\d+) sec|MISSED CALL))?/.exec(lines[0]);
    if (!head) throw new Error(`Cannot parse header: ${lines[0]}`);
    const [, baseId, day, month, t1, t2, min, sec] = head;
    const number = `+91900000${baseId.slice(1).padStart(4, "0")}`;

    // split into calls (only T17 has two) and keep only spoken lines
    const calls: { lines: string[]; sec: number | null }[] = [{ lines: [], sec: min ? duration(min, sec) : null }];
    let inNote = false;
    for (const line of lines.slice(1)) {
      const marker = /^(First|Second) call — (?:disconnected at (\d+) min (\d+) sec|(\d+) min (\d+) sec)/.exec(line);
      if (marker) {
        if (marker[1] === "Second") calls.push({ lines: [], sec: null });
        calls[calls.length - 1].sec = marker[2] ? duration(marker[2], marker[3]) : duration(marker[4], marker[5]);
        inNote = false;
        continue;
      }
      const speaker = /^(Front Desk|Caller):\s*(.*)$/.exec(line);
      if (speaker) {
        inNote = false;
        calls[calls.length - 1].lines.push(`${speaker[1] === "Caller" ? "Caller" : "Agent"}: ${speaker[2]}`);
      } else if (/^Note:/.test(line)) {
        inNote = true;
      } else if (!inNote && calls[calls.length - 1].lines.length > 0 && line.trim()) {
        calls[calls.length - 1].lines[calls[calls.length - 1].lines.length - 1] += ` ${line.trim()}`; // wrapped line
      }
    }

    calls.forEach((c, i) => {
      out.push({
        id: calls.length > 1 ? `${baseId}${"ab"[i]}` : baseId,
        baseId,
        startedAt: startTime(Number(day), month, i === 0 ? t1 : (t2 ?? t1)),
        durationSec: c.sec ?? 0,
        callerNumber: number,
        transcript: c.lines.join("\n"),
      });
    });
  }
  return out.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

export function loadPhoneTranscripts(root = process.cwd()): ReplayCall[] {
  return parsePhoneTranscripts(readFileSync(path.join(root, "source/enquiries.txt"), "utf8"));
}
