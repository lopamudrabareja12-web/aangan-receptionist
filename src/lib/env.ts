import { z } from "zod";

// Validated lazily so `next build` and unit tests do not need real secrets.
const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  NIKHIL_EMAIL: z.string().email(),
  VAANI_WEBHOOK_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  CRON_SECRET: z.string().min(1),
  DASHBOARD_PASSWORD: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Read the env vars a caller needs; throws a message naming only the MISSING or invalid variables. */
export function requireEnv<K extends keyof ServerEnv>(...keys: K[]): Pick<ServerEnv, K> {
  const out: Partial<ServerEnv> = {};
  const bad: string[] = [];
  for (const key of keys) {
    const parsed = serverSchema.shape[key].safeParse(process.env[key]);
    if (parsed.success) out[key] = parsed.data as ServerEnv[K];
    else bad.push(key);
  }
  if (bad.length > 0) {
    throw new Error(`Missing or invalid environment variables: ${bad.join(", ")}. See .env.example.`);
  }
  return out as Pick<ServerEnv, K>;
}
