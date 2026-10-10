// A tiny in-memory stand-in for HubSpot's HTTP API, used by tests. It records every request.
export interface Recorded {
  method: string;
  path: string;
  body: unknown;
  auth: string | null;
}
export type Handler = (req: Recorded) => { status?: number; body?: unknown; headers?: Record<string, string> };

export function fakeHubSpot(routes: Record<string, Handler | Handler[]>) {
  const calls: Recorded[] = [];
  const counters: Record<string, number> = {};
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const key = `${init?.method ?? "GET"} ${u.pathname}`;
    const rec: Recorded = {
      method: init?.method ?? "GET",
      path: u.pathname + u.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get("authorization"),
    };
    calls.push(rec);
    const entry = routes[key];
    if (!entry) return new Response(JSON.stringify({ message: `no route for ${key}` }), { status: 404 });
    const i = (counters[key] = (counters[key] ?? -1) + 1);
    const h = Array.isArray(entry) ? entry[Math.min(i, entry.length - 1)] : entry;
    const out = h(rec);
    return new Response(out.body === undefined ? null : JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: out.headers,
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

// Request bodies are inspected loosely in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = (x: unknown): any => x;
