import { requireEnv } from "@/lib/env";
import { claimByLink } from "@/lib/pipeline/claim";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { getSupabase } from "@/lib/supabase/server";

/** The "Claim" button posts here. A POST (not a link) so mail scanners that pre-open links cannot claim for anyone. */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const leadId = String(form.get("leadId") ?? "");
  const designerId = String(form.get("d") ?? "");
  const token = String(form.get("t") ?? "");
  const { CLAIM_LINK_SECRET } = requireEnv("CLAIM_LINK_SECRET");
  const result = await claimByLink({ store: new SupabaseStore(getSupabase()), secret: CLAIM_LINK_SECRET, now: new Date() }, leadId, designerId, token);
  const back = new URL(`/claim/${encodeURIComponent(leadId)}`, request.url);
  back.searchParams.set("d", designerId);
  back.searchParams.set("t", token);
  back.searchParams.set("r", result.status);
  return Response.redirect(back, 303);
}
