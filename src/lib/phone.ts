/** Normalise an Indian phone number to E.164 (+91XXXXXXXXXX). Returns null when it cannot be a valid number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hadPlus = raw.trim().startsWith("+");
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (hadPlus || d.length > 10) {
    if (d.startsWith("91") && d.length === 12) return `+${d}`;
    if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
    return d.length >= 8 && d.length <= 15 && hadPlus ? `+${d}` : null;
  }
  if (d.length === 10) return `+91${d}`;
  return null;
}
