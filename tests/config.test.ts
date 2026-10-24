import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { configIssues, env, missingConfig, required } from "../lib/config";

afterEach(() => vi.unstubAllEnvs());
describe("environment readiness", () => {
  it("detects missing and whitespace-only values without returning secrets", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "   ");
    expect(() => env("SUPABASE_SERVICE_ROLE_KEY")).toThrow(
      "Missing environment variable",
    );
    expect(missingConfig()).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(
      configIssues().find((i) => i.key === "SUPABASE_SERVICE_ROLE_KEY"),
    ).toEqual({ key: "SUPABASE_SERVICE_ROLE_KEY", reason: "Missing" });
  });
  it("rejects invalid nonempty values before the worker can spend", () => {
    const invalid = {
      APP_URL: "http://localhost:3000",
      SUPABASE_URL: "not-a-url",
      LOVABLE_OAUTH_TOKENS: '{"secret":"never-echo-me"}',
      COST_LOVABLE_BUILD_USD: "NaN",
      SALE_PRICE_USD: "0",
      TERAC_MAX_TASK_COST_USD: "-1",
      WHOP_WEBHOOK_SECRET: "your-secret",
      DOWNLOAD_SIGNING_SECRET: "short",
      EMAIL_FROM: "not-an-email",
    };
    for (const [key, value] of Object.entries(invalid)) vi.stubEnv(key, value);
    for (const key of Object.keys(invalid))
      expect(missingConfig()).toContain(key);
    expect(JSON.stringify(configIssues())).not.toContain("never-echo-me");
  });
  it("accepts configured values and leaves optional credentials optional", () => {
    for (const key of required) vi.stubEnv(key, "configured");
    const valid = {
      APP_URL: "https://sidewalk.example.com",
      SUPABASE_URL: "https://project.supabase.co",
      LOVABLE_MCP_URL: "https://mcp.lovable.dev",
      LOVABLE_OAUTH_TOKENS: JSON.stringify({
        access_token: "token",
        token_type: "Bearer",
      }),
      WHOP_WEBHOOK_SECRET: "ws_configured",
      DOWNLOAD_SIGNING_SECRET: "a".repeat(64),
      EMAIL_FROM: "Sidewalk <hello@example.com>",
    };
    for (const key of required.filter(
      (k) =>
        k.startsWith("COST_") ||
        ["SALE_PRICE_USD", "TERAC_MAX_TASK_COST_USD"].includes(k),
    ))
      vi.stubEnv(key, "1");
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
    vi.stubEnv("LOVABLE_OAUTH_CLIENT_SECRET", "");
    expect(configIssues()).toEqual([]);
  });
  it("has no sample-data or illustrative-map implementation in the dashboard", () => {
    const page = readFileSync(
      new URL("../app/page.tsx", import.meta.url),
      "utf8",
    );
    const map = readFileSync(
      new URL("../app/business-map.tsx", import.meta.url),
      "utf8",
    );
    expect(page).not.toMatch(/demoData|setDemo|dashboard-demo/);
    expect(page).toContain('api("businesses")');
    expect(map).not.toMatch(/SampleMap|samplePosition|demo_location/);
    expect(page).toContain("missing.length > 0");
  });
});
