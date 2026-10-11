export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Same key within 24h = Resend sends it once. Stops a retried tick from emailing twice. */
  idempotencyKey?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<{ id: string }>;
}

export class MailError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Resend ${status}: ${detail}`);
    this.name = "MailError";
  }
}

/** Minimal Resend client over fetch. The API key only goes into the Authorization header, never into messages. */
export class ResendMailer implements Mailer {
  constructor(private readonly opts: { apiKey: string; from: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; retries?: number }) {}

  async send(mail: Mail): Promise<{ id: string }> {
    const f = this.opts.fetch ?? fetch;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const retries = this.opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await f("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
          ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: this.opts.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (res.ok) return { id: ((await res.json()) as { id: string }).id };
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* no body */
      }
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) throw new MailError(res.status, detail.slice(0, 200));
      const wait = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 800 * 2 ** attempt);
    }
  }
}
