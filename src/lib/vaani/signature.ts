import { createHmac, timingSafeEqual } from "node:crypto";

// Confirmed against Vaani's real test request: header `x-webhook-signature: sha256=<hex>`, where hex is
// HMAC-SHA256(secret, exact raw request body). There is no timestamp header. The event name is in `x-webhook-event`.
export const SIGNATURE_HEADER = "x-webhook-signature";
export const EVENT_HEADER = "x-webhook-event";

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
