import nextEnv from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { configIssues, env } from "../lib/config";
import { db } from "../lib/db";
import { verifiedSender } from "../lib/mail";
import { Terac } from "../lib/terac";
import { salesOpportunity } from "../lib/sales";
import { teracArguments } from "../lib/terac";
import { Lovable } from "../lib/lovable";
import { whop } from "../lib/commerce";
import OpenAI from "openai";
import { safeError } from "../lib/preflight";
import { request, json } from "../lib/http";
nextEnv.loadEnvConfig(process.cwd());
const issues = configIssues();
for (const issue of issues) console.log(`BLOCK ${issue.key}: ${issue.reason}`);
if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
  console.log(
    "BLOCK NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: browser map key missing (dashboard map unavailable)",
  );
console.log(
  "Read-only preflight: no run, builds, listings, recruitment or email sends. Google/Exa probes may use API quota.",
);
const tasks: [string, () => Promise<unknown>][] = [
  [
    "Docker build isolation",
    () =>
      promisify(execFile)(
        "docker",
        ["info", "--format", "{{.ServerVersion}}"],
        { timeout: 15000 },
      ),
  ],
  [
    "Chromium",
    async () => {
      const browser = await chromium.launch();
      await browser.close();
    },
  ],
  [
    "Database schema",
    async () => {
      const failures: string[] = [];
      for (const table of [
        "runs",
        "businesses",
        "audits",
        "opportunities",
        "sites",
        "products",
        "emails",
        "sales_tasks",
        "sales_suppressions",
        "orders",
        "events",
      ]) {
        const { error } = await db().from(table).select("*").limit(1);
        if (error) failures.push(table);
      }
      if (failures.length)
        throw new Error(`Schema unavailable: ${failures.join(", ")}`);
    },
  ],
  [
    "Private source bucket",
    async () => {
      const { data, error } = await db().storage.getBucket(
        env("SUPABASE_ZIP_BUCKET"),
      );
      if (error) throw error;
      if (data.public) throw new Error("ZIP bucket must be private");
    },
  ],
  [
    "Public screenshot bucket",
    async () => {
      const { data, error } = await db().storage.getBucket(
        env("SUPABASE_MEDIA_BUCKET"),
      );
      if (error) throw error;
      if (!data.public) throw new Error("Screenshot bucket must be public");
    },
  ],
  [
    "Terac MCP sales contract",
    async () => {
      const terac = new Terac();
      try {
        await terac.connect();
        const tool = terac.tools.find(
          (t) => t.name === "terac_create_opportunity",
        )!;
        teracArguments(
          tool,
          salesOpportunity({ id: "00000000-0000-4000-8000-000000000000" }),
        );
        for (const [name, args] of Object.entries({
          terac_get_opportunity: { opportunity_id: "contract-check" },
          terac_launch_draft_opportunity: { opportunity_id: "contract-check" },
          terac_get_submission: { submission_id: "contract-check" },
          terac_approve_submission: { submission_id: "contract-check" },
        }))
          teracArguments(
            terac.tools.find((t) => t.name === name)!,
            args,
          );
      } finally {
        await terac.close();
      }
    },
  ],
  ["Verified buyer-delivery sender", verifiedSender],
  [
    "Whop account",
    async () => {
      await whop().accounts.retrieve({ id: env("WHOP_ACCOUNT_ID") });
    },
  ],
  [
    "Lovable MCP contract",
    async () => {
      const lovable = new Lovable();
      try {
        await lovable.connect();
        for (const name of [
          "create_project",
          "get_project",
          "send_message",
          "deploy_project",
          "list_files",
          "read_file",
        ])
          if (!lovable.tools.some((t) => t.name === name))
            throw new Error(`Missing tool ${name}`);
      } finally {
        await lovable.close();
      }
    },
  ],
];
const dependencies: Record<string, string[]> = {
  "Database schema": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "Private source bucket": [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ZIP_BUCKET",
  ],
  "Public screenshot bucket": [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_MEDIA_BUCKET",
  ],
  "Terac MCP sales contract": [
    "TERAC_API_KEY",
    "TERAC_PROJECT_ID",
    "TERAC_MAX_TASK_COST_USD",
    "APP_URL",
    "DOWNLOAD_SIGNING_SECRET",
  ],
  "Verified buyer-delivery sender": [
    "RESEND_DOMAIN_ID",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "SENDER_POSTAL_ADDRESS",
  ],
  "Whop account": ["WHOP_API_KEY", "WHOP_ACCOUNT_ID"],
  "Lovable MCP contract": [
    "LOVABLE_MCP_URL",
    "LOVABLE_OAUTH_CLIENT_ID",
    "LOVABLE_OAUTH_TOKENS",
  ],
  "OpenAI model access": ["OPENAI_API_KEY", "OPENAI_MODEL"],
  "Google Geocoding": ["GOOGLE_MAPS_API_KEY"],
  "Google Places (New)": ["GOOGLE_MAPS_API_KEY"],
  "Exa search": ["EXA_API_KEY"],
  "Resend API access": ["RESEND_API_KEY"],
};
tasks.push(
  [
    "OpenAI model access",
    async () => {
      await new OpenAI({
        apiKey: env("OPENAI_API_KEY"),
        timeout: 20000,
        maxRetries: 0,
      }).models.retrieve(env("OPENAI_MODEL"));
    },
  ],
  [
    "Google Geocoding",
    async () => {
      const geo = await (
        await request(
          `https://maps.googleapis.com/maps/api/geocode/json?address=Williamsburg%2C%20Brooklyn&key=${encodeURIComponent(env("GOOGLE_MAPS_API_KEY"))}`,
        )
      ).json();
      if (geo.status !== "OK" || !geo.results?.[0]?.place_id)
        throw new Error(`Geocoding status: ${geo.status}`);
    },
  ],
  [
    "Google Places (New)",
    async () => {
      const response = await fetch(
        "https://places.googleapis.com/v1/places/ChIJd8BlQ2BZwokRAFUEcm_qrcA",
        {
          headers: {
            "X-Goog-Api-Key": env("GOOGLE_MAPS_API_KEY"),
            "X-Goog-FieldMask": "id",
          },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) {
        const data = await response.json();
        if (
          data.error?.details?.some(
            (detail: { reason?: string }) =>
              detail.reason === "SERVICE_DISABLED",
          )
        )
          throw new Error("Places API (New) disabled");
        throw Object.assign(new Error("Google Places request failed"), {
          status: response.status,
        });
      }
    },
  ],
  [
    "Exa search",
    async () => {
      const result = await json(
        "https://api.exa.ai/search",
        { query: "https://example.com", numResults: 1 },
        { "x-api-key": env("EXA_API_KEY") },
      );
      if (!Array.isArray(result.results))
        throw new Error("Missing search results envelope");
    },
  ],
  [
    "Resend API access",
    async () => {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const data = await response.json();
        if (/restricted to only send emails/i.test(data.message ?? ""))
          throw new Error(
            "Resend key is send-only; full access required for domain verification",
          );
        throw Object.assign(new Error("Resend request failed"), {
          status: response.status,
        });
      }
    },
  ],
);
let failed =
  issues.length > 0 || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
for (const [name, test] of tasks) {
  const blocked = (dependencies[name] ?? []).filter((key) =>
    issues.some((issue) => issue.key === key),
  );
  if (blocked.length) {
    console.log(`SKIP ${name}: ${blocked.join(", ")}`);
    continue;
  }
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${safeError(error)}`);
  }
}
console.log(
  failed
    ? "NOT READY: resolve every BLOCK/FAIL before a run."
    : "Preflight passed. Browser map restrictions, model generation, provider write permissions, public webhook delivery and a genuine checkout still require live acceptance.",
);
if (failed) process.exitCode = 1;
