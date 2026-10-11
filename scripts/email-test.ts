// Sends ONE clearly labelled test email (the real handoff layout, a made-up lead) to the first on-duty designer.
//   npm run email:test
import { existsSync } from "node:fs";
import { claimUrl } from "@/lib/claim-token";
import { handoffEmail } from "@/lib/mail/emails";
import { ResendMailer } from "@/lib/mail/resend";
import { composeHandoffNote } from "@/lib/pipeline/handoff";
import { applyRubric } from "@/lib/pipeline/rubric";
import { SupabaseStore } from "@/lib/pipeline/supabase-store";
import { getSupabase } from "@/lib/supabase/server";
import { GOLDEN, GoldenExtractor } from "@/replay/golden";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, CLAIM_LINK_SECRET } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !APP_BASE_URL || !CLAIM_LINK_SECRET) throw new Error("RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL and CLAIM_LINK_SECRET must be set");
  const designer = (await new SupabaseStore(getSupabase()).listDesigners()).find((d) => d.onDuty && d.hubspotOwnerId);
  if (!designer) throw new Error("no on-duty designer linked to HubSpot");

  const g = new GoldenExtractor();
  g.current = "T01";
  const extraction = (await g.extract()).extraction;
  const callStartedAt = new Date();
  const rubric = applyRubric({ extraction, callStartedAt });
  const note = composeHandoffNote({ extraction, rubric, callerName: "Test Caller", callerPhone: "+919000000000", callStartedAt, callId: "TEST-EMAIL" });
  const leadId = "00000000-0000-0000-0000-000000000000";
  const mail = handoffEmail({
    to: designer.email, designerName: designer.name, subject: "[TEST] New enquiry: Test Caller · 3BHK apartment · Kothrud",
    noteText: note.text, noteHtml: note.html, claimUrl: claimUrl(APP_BASE_URL, CLAIM_LINK_SECRET, leadId, designer.id), timeoutMinutes: 15, leadId: `test-${Date.now()}`,
  });
  void GOLDEN;
  const sent = await new ResendMailer({ apiKey: RESEND_API_KEY, from: EMAIL_FROM }).send(mail);
  console.log(`Sent test email ${sent.id} to ${designer.email}. Subject: ${mail.subject}`);
  console.log("(The claim button in this sample points at a made-up lead, so it will say the link is not valid. That is expected for a test.)");
}

main().catch((e) => {
  console.error("TEST EMAIL FAILED:", String(e instanceof Error ? e.message : e));
  process.exit(1);
});
