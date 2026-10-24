import { z } from "zod";
export function env(key: string): string {
  const value = process.env[key];
  if (!value?.trim()) throw new Error(`Missing environment variable: ${key}`);
  return value;
}
export function cost(key: string) {
  const value = Number(env(key));
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Invalid cost: ${key}`);
  return value;
}
export const runSchema = z
  .object({
    selectedBusinessId: z.uuid().optional(),
    area: z.string().trim().min(3).max(200),
    radiusMeters: z.number().int().min(100).max(50000),
    types: z
      .array(
        z.enum([
          "cafe",
          "restaurant",
          "bakery",
          "bar",
          "florist",
          "hair_salon",
          "beauty_salon",
        ]),
      )
      .min(1)
      .max(5),
    maxBusinesses: z.number().int().min(1).max(30),
    siteScoreThreshold: z.literal(45).default(45),
    maxSitesToBuild: z.number().int().min(1).max(3),
    maxRealEmails: z.number().int().min(0).max(3),
    maxSalesTasks: z.number().int().min(0).max(3),
    requireEmailAndPhone: z.boolean().default(false),
    maxLovableRepairAttempts: z.number().int().min(0).max(2),
    maxEstimatedRunCostUsd: z.number().min(1).max(100),
  })
  .superRefine((run, ctx) => {
    if (run.selectedBusinessId && run.maxSitesToBuild !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["maxSitesToBuild"],
        message: "A selected business run builds exactly one site",
      });
    if (
      run.requireEmailAndPhone &&
      (run.maxRealEmails < 1 || run.maxSalesTasks < 1)
    )
      ctx.addIssue({
        code: "custom",
        path: ["requireEmailAndPhone"],
        message:
          "Requiring email and phone needs at least one sales email and one sales assignment",
      });
  });
export type RunInput = z.infer<typeof runSchema>;
export const required = [
  "APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_MAPS_API_KEY",
  "EXA_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "LOVABLE_OAUTH_TOKENS",
  "LOVABLE_OAUTH_CLIENT_ID",
  "LOVABLE_MCP_URL",
  "TERAC_API_KEY",
  "TERAC_PROJECT_ID",
  "TERAC_MAX_TASK_COST_USD",
  "WHOP_API_KEY",
  "WHOP_ACCOUNT_ID",
  "WHOP_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "RESEND_DOMAIN_ID",
  "SENDER_NAME",
  "SENDER_POSTAL_ADDRESS",
  "DOWNLOAD_SIGNING_SECRET",
  "SUPABASE_ZIP_BUCKET",
  "SUPABASE_MEDIA_BUCKET",
  "COST_PLACES_SEARCH_USD",
  "COST_EXA_SEARCH_USD",
  "COST_MODEL_RESEARCH_USD",
  "COST_LOVABLE_BUILD_USD",
  "COST_LOVABLE_REPAIR_USD",
  "SALE_PRICE_USD",
  "PAYMENT_FEE_PERCENT",
  "PAYMENT_FEE_FIXED_USD",
];
export function missingConfig() {
  return configIssues().map((issue) => issue.key);
}

/** Names and fixed messages only: safe for the public configuration endpoint. */
export function configIssues() {
  const issues: { key: string; reason: string }[] = [];
  for (const key of required) {
    const value = process.env[key]?.trim();
    if (!value) {
      issues.push({ key, reason: "Missing" });
      continue;
    }
    let reason = "";
    if (/^(?:your[_ -]|replace[_ -]|changeme|placeholder|<)/i.test(value))
      reason = "Replace placeholder";
    else if (["APP_URL", "SUPABASE_URL", "LOVABLE_MCP_URL"].includes(key)) {
      try {
        const url = new URL(value);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          reason = "Use an HTTP(S) URL without credentials, query or fragment";
        else if (
          key === "APP_URL" &&
          (url.protocol !== "https:" ||
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
            url.pathname !== "/")
        )
          reason = "Public HTTPS origin required for sales and buyer links";
      } catch {
        reason = "Invalid URL";
      }
    } else if (
      key.startsWith("COST_") ||
      [
        "TERAC_MAX_TASK_COST_USD",
        "SALE_PRICE_USD",
        "PAYMENT_FEE_PERCENT",
        "PAYMENT_FEE_FIXED_USD",
      ].includes(key)
    ) {
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        number < 0 ||
        (["SALE_PRICE_USD", "TERAC_MAX_TASK_COST_USD"].includes(key) &&
          number === 0) ||
        (key === "PAYMENT_FEE_PERCENT" && number > 100)
      )
        reason = "Invalid numeric amount";
    } else if (key === "DOWNLOAD_SIGNING_SECRET" && value.length < 32)
      reason = "Use at least 32 random characters";
    else if (key === "WHOP_WEBHOOK_SECRET" && !/^ws_.+/.test(value))
      reason = "Use the unchanged ws_ webhook signing secret";
    else if (
      key === "EMAIL_FROM" &&
      !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(value) &&
      !/^[^<>]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(value)
    )
      reason = "Invalid sender email";
    else if (key === "LOVABLE_OAUTH_TOKENS") {
      try {
        const tokens = JSON.parse(value);
        if (
          !tokens ||
          typeof tokens.access_token !== "string" ||
          !tokens.access_token.trim() ||
          typeof tokens.token_type !== "string"
        )
          reason = "OAuth token object requires access_token and token_type";
      } catch {
        reason = "Invalid OAuth token JSON";
      }
    }
    if (reason) issues.push({ key, reason });
  }
  return issues;
}
