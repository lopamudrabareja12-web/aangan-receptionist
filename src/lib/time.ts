const IST_OFFSET_MS = 5.5 * 3600 * 1000;
export const WORK_START_HOUR = 10;
export const WORK_END_HOUR = 19;

/** The next moment (at or after `from`) when the studio is open, 10:00-19:00 IST. */
export function nextWorkingStart(from: Date): Date {
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  if (hour >= WORK_START_HOUR && hour < WORK_END_HOUR) return from;
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), WORK_START_HOUR));
  if (hour >= WORK_END_HOUR) day.setUTCDate(day.getUTCDate() + 1);
  return new Date(day.getTime() - IST_OFFSET_MS);
}

/** 10:00 IST on a YYYY-MM-DD date. */
export function istMorning(isoDate: string): Date {
  return new Date(Date.parse(`${isoDate}T${String(WORK_START_HOUR).padStart(2, "0")}:00:00Z`) - IST_OFFSET_MS);
}

/** Adds working minutes (studio open 10:00-19:00 IST): time outside opening hours does not count. */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  let cursor = nextWorkingStart(from);
  let remaining = minutes;
  for (let guard = 0; guard < 400; guard++) {
    const ist = new Date(cursor.getTime() + IST_OFFSET_MS);
    const dayEnd = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), WORK_END_HOUR) - IST_OFFSET_MS);
    const available = (dayEnd.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60_000);
    remaining -= available;
    cursor = nextWorkingStart(dayEnd); // 19:00 rolls to 10:00 the next day
  }
  throw new Error("addWorkingMinutes: minutes too large");
}
