"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn } from "@/lib/console/auth";
import { reinstateLead } from "@/lib/console/reinstate";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { getSupabase } from "@/lib/supabase/server";

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function toggleDuty(formData: FormData): Promise<void> {
  await requireSignedIn();
  const id = text(formData, "id");
  const onDuty = text(formData, "onDuty") === "true";
  const { error } = await getSupabase().from("designers").update({ on_duty: onDuty }).eq("id", id);
  if (error) throw new Error("Could not update the designer.");
  revalidatePath("/console/designers");
}

export async function reinstate(formData: FormData): Promise<void> {
  await requireSignedIn();
  const store = new SupabaseStore(getSupabase());
  const settings = await store.getSettings();
  await reinstateLead({ store, now: new Date(), avgProjectValueInr: settings.avg_project_value_inr, baseUrl: process.env.APP_BASE_URL }, text(formData, "leadId"));
  revalidatePath("/console/declined");
}

/** Puts a dead or waiting HubSpot write back in the queue so the next minute's job tries it again. */
export async function retryOutbox(formData: FormData): Promise<void> {
  await requireSignedIn();
  const { error } = await getSupabase().from("hubspot_outbox").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null }).eq("id", text(formData, "id")).in("status", ["dead", "pending"]);
  if (error) throw new Error("Could not requeue that write.");
  revalidatePath("/console/health");
}

const SETTING_FIELDS: Record<string, { min: number; max: number }> = {
  voice_rate_inr_per_min: { min: 0, max: 1000 }, gemini_input_usd_per_m: { min: 0, max: 1000 }, gemini_output_usd_per_m: { min: 0, max: 1000 },
  usd_inr: { min: 1, max: 1000 }, resend_monthly_inr: { min: 0, max: 10_000_000 }, hosting_monthly_inr: { min: 0, max: 10_000_000 },
  conversion_rate: { min: 0, max: 1 }, avg_project_value_inr: { min: 1, max: 1_000_000_000 },
};

export async function saveSettings(formData: FormData): Promise<void> {
  await requireSignedIn();
  const update: Record<string, number> = {};
  for (const [key, range] of Object.entries(SETTING_FIELDS)) {
    const raw = text(formData, key).trim();
    if (raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < range.min || v > range.max) throw new Error(`${key} must be a number between ${range.min} and ${range.max}.`);
    update[key] = v;
  }
  if (Object.keys(update).length === 0) return;
  const { error } = await getSupabase().from("settings").update(update).eq("id", 1);
  if (error) throw new Error("Could not save the settings.");
  revalidatePath("/console/costs");
}
