import { createHmac, timingSafeEqual } from "node:crypto";

// ASSUMPTION: HMAC-SHA256 of the raw body, hex encoded, optionally prefixed "sha256=", in this header.
// Confirm against Vaani's docs; only this file changes.
export const SIGNATURE_HEADER = "x-vaani-signature";

export function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Constant-time check of the raw request body against the signature header. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = sign(rawBody, secret);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
