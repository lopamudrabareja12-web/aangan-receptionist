export class HubSpotError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    detail: string,
  ) {
    super(`HubSpot ${method} ${path} -> ${status}: ${detail}`);
    this.name = "HubSpotError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxRetries?: number;
}

/**
 * Small HubSpot REST client. Retries 429 (honouring Retry-After), 5xx and network errors with jittered
 * exponential backoff. The token is only ever put in the Authorization header: it is never logged or put in errors.
 */
export class HubSpotClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxRetries: number;

  constructor(opts: ClientOptions) {
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? "https://api.hubapi.com";
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        if (attempt >= this.maxRetries) throw new HubSpotError(0, method, path, "network error");
        await this.sleep(this.backoff(attempt));
        continue;
      }

      if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

      const text = await res.text();
      let detail = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { message?: string };
        if (j.message) detail = j.message;
      } catch {
        /* keep raw snippet */
      }
      const err = new HubSpotError(res.status, method, path, detail);
      if (!err.retryable || attempt >= this.maxRetries) throw err;

      const retryAfter = Number(res.headers.get("retry-after"));
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt));
    }
  }

  private backoff(attempt: number): number {
    return Math.min(30_000, 500 * 2 ** attempt) * (0.5 + this.random() / 2);
  }
}
