// Links designers to real HubSpot users (owners) and retires the placeholder designers.
//   npm run designers:sync              dry run: shows what would change
//   npm run designers:sync -- --apply   write to Supabase
import { existsSync } from "node:fs";
import { HubSpotClient } from "@/lib/hubspot/client";
import { listOwners } from "@/lib/hubspot/crm";
import { getSupabase } from "@/lib/supabase/server";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const apply = process.argv.includes("--apply");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set in .env.local");
  const owners = await listOwners(new HubSpotClient({ token }));
  const db = getSupabase();
  console.log(apply ? "APPLYING:" : "DRY RUN (nothing will be changed):");
  console.log(`HubSpot users found: ${owners.length}`);
  for (const o of owners) {
    const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email;
    console.log(`  - ${name} <${o.email}> (HubSpot owner ${o.id}) -> designer, on duty`);
    if (apply) {
      const { error } = await db.from("designers").upsert({ name, email: o.email, hubspot_owner_id: o.id, on_duty: true }, { onConflict: "email" });
      if (error) throw new Error(`could not save ${o.email}: ${error.message}`);
    }
  }
  console.log("  - placeholder designers (@example.invalid) -> off duty");
  if (apply) {
    const { error } = await db.from("designers").update({ on_duty: false }).like("email", "%@example.invalid");
    if (error) throw new Error(error.message);
  }
  if (!apply) console.log("Re-run with --apply to make these changes.");
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
