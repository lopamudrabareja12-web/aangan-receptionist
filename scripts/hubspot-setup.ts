// Usage:
//   npm run hubspot:setup                          dry run: prints what would change (read-only calls only)
//   npm run hubspot:setup -- --apply               perform the changes
//   npm run hubspot:setup -- --apply --adopt-default   free plan: reuse the EMPTY default pipeline instead of creating a second one
import { existsSync } from "node:fs";
import { HubSpotClient } from "@/lib/hubspot/client";
import { checkAssociations, planSetup, readPortalState, applyAction, describeAction } from "@/lib/hubspot/setup";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const apply = process.argv.includes("--apply");
  const adoptDefault = process.argv.includes("--adopt-default");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.log("HUBSPOT_ACCESS_TOKEN is not set in .env.local, so nothing can be checked or changed yet.");
    console.log("Offline plan: create the custom deal properties, then the pipeline and its 14 stages.");
    return;
  }
  const client = new HubSpotClient({ token });

  const state = await readPortalState(client);
  const plan = planSetup(state, { adoptDefault });
  console.log(apply ? "APPLYING:" : "DRY RUN (nothing will be changed):");
  if (plan.actions.length === 0) console.log("  portal already matches the desired setup");
  for (const a of plan.actions) console.log("  -", describeAction(a));
  for (const w of plan.warnings) console.log("  ! warning:", w);

  const problems = await checkAssociations(client);
  console.log(problems.length ? "Association check FAILED:" : "Association type ids match this portal.");
  for (const p of problems) console.log("  !", p);

  if (apply) {
    for (const a of plan.actions) console.log("  done:", await applyAction(client, a));
  } else if (plan.actions.length) {
    console.log("Re-run with --apply to make these changes.");
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
