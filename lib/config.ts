import { z } from "zod";
export function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}
export function cost(key: string) {
  const value = Number(env(key));
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Invalid cost: ${key}`);
  return value;
}
export const runSchema = z.object({
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
  maxLovableRepairAttempts: z.number().int().min(0).max(2),
  maxEstimatedRunCostUsd: z.number().min(1).max(100),
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
  return required.filter((key) => !process.env[key]);
}
