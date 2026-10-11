import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { CALL_STATUSES, DECISIONS, OWNER_STATUSES } from "@/lib/domain";

const root = path.resolve(__dirname, "../..");
const migrationFiles = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const f of migrationFiles) await db.exec(readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
  await db.exec(seed);
});

async function enumValues(name: string): Promise<string[]> {
  const r = await db.query<{ enumlabel: string }>(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = $1 order by e.enumsortorder`,
    [name],
  );
  return r.rows.map((x) => x.enumlabel);
}

describe("schema", () => {
  it("TypeScript enum constants match the database enums", async () => {
    expect(await enumValues("lead_stage")).toEqual([]); // stage state lives in HubSpot, not Postgres
    expect((await enumValues("lead_decision")).sort()).toEqual([...DECISIONS].sort());
    expect((await enumValues("call_status")).sort()).toEqual([...CALL_STATUSES].sort());
    expect((await enumValues("owner_status")).sort()).toEqual([...OWNER_STATUSES].sort());
  });

  it("seeds three clearly-fake designers and exactly one settings row", async () => {
    const d = await db.query<{ email: string }>("select email from designers order by email");
    expect(d.rows).toHaveLength(3);
    expect(d.rows.every((r) => r.email.endsWith("@example.invalid"))).toBe(true);
    const s = await db.query<{ claim_timeout_minutes: number; avg_project_value_inr: string }>("select * from settings");
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].claim_timeout_minutes).toBe(15);
    expect(Number(s.rows[0].avg_project_value_inr)).toBe(1100000); // midpoint of 8-14 lakh
  });

  it("seeding twice does not duplicate rows (idempotent)", async () => {
    await db.exec(seed);
    expect((await db.query("select 1 from designers")).rows).toHaveLength(3);
    expect((await db.query("select 1 from settings")).rows).toHaveLength(1);
  });

  it("rejects a second settings row", async () => {
    await expect(db.exec("insert into settings (id) values (2)")).rejects.toThrow();
  });

  it("vaani_call_id is unique, so a replayed webhook cannot create a second call", async () => {
    await db.exec("insert into calls (vaani_call_id) values ('call-1')");
    await expect(db.exec("insert into calls (vaani_call_id) values ('call-1')")).rejects.toThrow();
  });

  it("a call has at most one lead, and updated_at moves on update", async () => {
    const c = await db.query<{ id: string }>("select id from calls where vaani_call_id = 'call-1'");
    const callId = c.rows[0].id;
    await db.query("insert into leads (call_id, decision) values ($1, 'qualified')", [callId]);
    await expect(
      db.query("insert into leads (call_id, decision) values ($1, 'declined')", [callId]),
    ).rejects.toThrow();
    const before = await db.query<{ updated_at: string }>("select updated_at from leads where call_id = $1", [callId]);
    await new Promise((r) => setTimeout(r, 20));
    await db.query("update leads set is_vip = true where call_id = $1", [callId]);
    const after = await db.query<{ updated_at: string }>("select updated_at from leads where call_id = $1", [callId]);
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(before.rows[0].updated_at).getTime());
  });

  it("costs.llm_tokens is the sum of input and output tokens", async () => {
    const c = await db.query<{ id: string }>("select id from calls where vaani_call_id = 'call-1'");
    await db.query("insert into costs (call_id, llm_input_tokens, llm_output_tokens) values ($1, 1200, 300)", [c.rows[0].id]);
    const r = await db.query<{ llm_tokens: number }>("select llm_tokens from costs");
    expect(r.rows[0].llm_tokens).toBe(1500);
  });

  it("enables row level security on every table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(r.rows.length).toBe(10);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("leads no longer store stage or owner: HubSpot is the source of truth for those", async () => {
    const r = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'leads'",
    );
    const cols = r.rows.map((x) => x.column_name);
    for (const gone of ["stage", "designer_id", "claimed_at", "lost_reason", "handoff_note"]) {
      expect(cols).not.toContain(gone);
    }
    expect(cols).toEqual(expect.arrayContaining(["hubspot_contact_id", "hubspot_deal_id"]));
  });

  it("outbox idempotency key is unique, so the same HubSpot write is never queued twice", async () => {
    await db.exec("insert into hubspot_outbox (idempotency_key, operation) values ('create_deal:call-1', 'create_deal')");
    await expect(
      db.exec("insert into hubspot_outbox (idempotency_key, operation) values ('create_deal:call-1', 'create_deal')"),
    ).rejects.toThrow();
    const r = await db.query<{ status: string; attempts: number }>("select status, attempts from hubspot_outbox");
    expect(r.rows[0]).toEqual({ status: "pending", attempts: 0 });
  });

  it("two designers cannot map to the same HubSpot owner", async () => {
    await db.exec("update designers set hubspot_owner_id = '111' where email = 'designer-a@example.invalid'");
    await expect(
      db.exec("update designers set hubspot_owner_id = '111' where email = 'designer-b@example.invalid'"),
    ).rejects.toThrow();
  });

  it("migration 0003 adds the extraction audit columns, the cancelled outbox status and call errors", async () => {
    const cols = async (t: string) => (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = $1", [t])).rows.map((x) => x.column_name);
    expect(await cols("leads")).toEqual(expect.arrayContaining(["extraction", "missing_fields", "summary", "price_asked", "reason_code", "rubric_version", "superseded_by_call_id"]));
    expect(await cols("calls")).toContain("error");
    expect(await enumValues("outbox_status")).toEqual(["pending", "done", "dead", "cancelled"]);
    await db.exec("update hubspot_outbox set status = 'cancelled'");
  });

  it("a superseded lead can point at the call that replaced it", async () => {
    await db.exec("insert into calls (vaani_call_id) values ('call-2')");
    const c = await db.query<{ id: string }>("select id from calls where vaani_call_id = 'call-2'");
    await db.query("update leads set superseded_by_call_id = $1", [c.rows[0].id]);
    const r = await db.query<{ superseded_by_call_id: string }>("select superseded_by_call_id from leads");
    expect(r.rows[0].superseded_by_call_id).toBe(c.rows[0].id);
  });

  it("migration 0004: one assignment per lead, a kind check, and a claim that only the first caller can win", async () => {
    const c = await db.query<{ id: string }>("select id from calls where vaani_call_id = 'call-1'");
    const lead = await db.query<{ id: string }>("select id from leads where call_id = $1", [c.rows[0].id]);
    const leadId = lead.rows[0].id;
    await db.query("insert into lead_assignments (lead_id, notify_at, subject, note_text, note_html) values ($1, now(), 's', 't', '<p>t</p>')", [leadId]);
    await expect(db.query("insert into lead_assignments (lead_id, notify_at, subject, note_text, note_html) values ($1, now(), 's', 't', 't')", [leadId])).rejects.toThrow();
    await expect(db.query("update lead_assignments set kind = 'banana' where lead_id = $1", [leadId])).rejects.toThrow();
    const d = await db.query<{ id: string }>("select id from designers order by email");
    const claim = (designer: string) => db.query(
      "update lead_assignments set status = 'claimed', designer_id = $2, claimed_at = now(), via = 'claim' where lead_id = $1 and kind = 'claim' and status in ('awaiting_notify','notified') returning lead_id",
      [leadId, designer],
    );
    expect((await claim(d.rows[0].id)).rows).toHaveLength(1); // first wins
    expect((await claim(d.rows[1].id)).rows).toHaveLength(0); // second changes nothing
    const owner = await db.query<{ designer_id: string }>("select designer_id from lead_assignments where lead_id = $1", [leadId]);
    expect(owner.rows[0].designer_id).toBe(d.rows[0].id);
  });

  it("migration 0005: Vaani call metadata is keyed by call id and has row level security", async () => {
    await db.exec("insert into vaani_call_meta (call_id, room_name, phone_number) values ('call_abc', 'room_abc', '+919000000099')");
    await expect(db.exec("insert into vaani_call_meta (call_id) values ('call_abc')")).rejects.toThrow();
  });
});
