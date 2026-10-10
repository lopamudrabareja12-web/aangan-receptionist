import { describe, it, expect } from "vitest";
import { HubSpotClient, HubSpotError } from "@/lib/hubspot/client";
import { fakeHubSpot } from "./fake";

const mk = (routes: Parameters<typeof fakeHubSpot>[0], extra: { maxRetries?: number } = {}) => {
  const f = fakeHubSpot(routes);
  const sleeps: number[] = [];
  const client = new HubSpotClient({
    token: "SECRET-TOKEN-123",
    fetch: f.fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 1,
    ...extra,
  });
  return { client, sleeps, ...f };
};

describe("HubSpotClient", () => {
  it("sends the bearer token and returns JSON", async () => {
    const { client, calls } = mk({ "GET /x": () => ({ body: { ok: 1 } }) });
    expect(await client.request("GET", "/x")).toEqual({ ok: 1 });
    expect(calls[0].auth).toBe("Bearer SECRET-TOKEN-123");
  });

  it("retries 429 and honours Retry-After", async () => {
    const { client, sleeps, calls } = mk({
      "GET /x": [() => ({ status: 429, headers: { "retry-after": "2" }, body: { message: "slow down" } }), () => ({ body: { ok: 1 } })],
    });
    expect(await client.request("GET", "/x")).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries 5xx with exponential backoff, then succeeds", async () => {
    const { client, sleeps } = mk({
      "GET /x": [() => ({ status: 503 }), () => ({ status: 502 }), () => ({ body: { ok: 1 } })],
    });
    await client.request("GET", "/x");
    expect(sleeps).toEqual([500, 1000]); // random() = 1 gives factor 1.0
  });

  it("gives up after maxRetries and throws a retryable error", async () => {
    const { client, calls } = mk({ "GET /x": () => ({ status: 500 }) }, { maxRetries: 2 });
    const err = (await client.request("GET", "/x").then(() => null, (e: unknown) => e)) as HubSpotError;
    expect(err).toBeInstanceOf(HubSpotError);
    expect(err.retryable).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("does not retry a 4xx, and its message never contains the token", async () => {
    const { client, calls } = mk({ "POST /x": () => ({ status: 403, body: { message: "missing scope crm.objects.deals.write" } }) });
    const err = (await client.request("POST", "/x", { a: 1 }).then(() => null, (e: unknown) => e)) as HubSpotError;
    expect(calls).toHaveLength(1);
    expect(err.status).toBe(403);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("missing scope");
    expect(err.message).not.toContain("SECRET-TOKEN-123");
  });
});
