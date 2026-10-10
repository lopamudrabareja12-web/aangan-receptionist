import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CALL_STATUSES, DECISIONS, OWNER_STATUSES, STAGES } from "@/lib/domain";

const root = path.resolve(__dirname, "../..");
const migration = readFileSync(path.join(root, "supabase/migrations/0001_init.sql"), "utf8");
const seed = readFileSync(path.join(root, "supabase/seed.sql"), "utf8");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(migration);
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
    expect((await enumValues("lead_stage")).sort()).toEqual([...STAGES].sort());
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
    await db.query("insert into leads (call_id, decision, stage) values ($1, 'qualified', 'new_qualified')", [callId]);
    await expect(
      db.query("insert into leads (call_id, decision, stage) values ($1, 'declined', 'declined')", [callId]),
    ).rejects.toThrow();
    const before = await db.query<{ updated_at: string }>("select updated_at from leads where call_id = $1", [callId]);
    await new Promise((r) => setTimeout(r, 20));
    await db.query("update leads set stage = 'claimed' where call_id = $1", [callId]);
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
    expect(r.rows.length).toBe(6);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
});
