import { describe, it, expect, afterEach } from "vitest";
import { requireEnv } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("requireEnv", () => {
  it("names the missing variables but never prints values", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "secret-looking-value";
    expect(() => requireEnv("GEMINI_API_KEY", "GEMINI_MODEL")).toThrow(/GEMINI_API_KEY/);
    try {
      requireEnv("GEMINI_API_KEY", "GEMINI_MODEL");
    } catch (e) {
      expect(String(e)).not.toContain("secret-looking-value");
      expect(String(e)).not.toContain("GEMINI_MODEL");
    }
  });

  it("returns only the requested keys when valid", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect(requireEnv("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")).toEqual({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    });
  });

  it("rejects a malformed URL", () => {
    process.env.SUPABASE_URL = "not-a-url";
    expect(() => requireEnv("SUPABASE_URL")).toThrow(/SUPABASE_URL/);
  });
});
