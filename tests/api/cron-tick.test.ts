import { describe, it, expect, afterEach } from "vitest";
import { GET, POST } from "@/app/api/cron/tick/route";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe("/api/cron/tick login check", () => {
  it("refuses a request without the secret, with a wrong one, or when no secret is configured", async () => {
    process.env.CRON_SECRET = "right-secret-right-secret";
    expect((await POST(new Request("http://x/api/cron/tick", { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request("http://x/api/cron/tick", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/tick", { headers: { authorization: "Bearer right-secret-right-secre" } }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await POST(new Request("http://x/api/cron/tick", { method: "POST", headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});
