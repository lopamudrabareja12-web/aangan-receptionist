import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "aangan_console";

/** The cookie value is a keyed hash of a fixed label: it proves the password was known without storing the password in the cookie. */
export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("aangan-console-session-v1").digest("hex");
}

const safeEqual = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function verifySession(password: string | undefined, token: string | undefined): boolean {
  if (!password || !token) return false;
  return safeEqual(token, sessionToken(password));
}

/** Compares through a hash so the length of the real password is not revealed by the comparison. */
export function checkPassword(expected: string | undefined, given: string): boolean {
  if (!expected || !given) return false;
  const h = (s: string) => createHmac("sha256", "aangan-password-check").update(s).digest("hex");
  return safeEqual(h(expected), h(given));
}
