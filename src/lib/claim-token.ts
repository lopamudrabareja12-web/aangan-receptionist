import { createHmac, timingSafeEqual } from "node:crypto";

// A claim link identifies ONE designer for ONE lead. It is an HMAC, so it cannot be guessed or edited.
// Opening the link only shows the lead; claiming needs a button press (a POST), so email scanners that
// pre-open links cannot claim by accident.

const sign = (secret: string, leadId: string, designerId: string) =>
  createHmac("sha256", secret).update(`claim|${leadId}|${designerId}`).digest("base64url");

export function makeClaimToken(secret: string, leadId: string, designerId: string): string {
  return sign(secret, leadId, designerId);
}

export function verifyClaimToken(secret: string, leadId: string, designerId: string, token: string | null | undefined): boolean {
  if (!secret || !token) return false;
  const expected = sign(secret, leadId, designerId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function claimUrl(baseUrl: string, secret: string, leadId: string, designerId: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/claim/${leadId}?d=${encodeURIComponent(designerId)}&t=${makeClaimToken(secret, leadId, designerId)}`;
}
