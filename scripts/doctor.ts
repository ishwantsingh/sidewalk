import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { missingConfig, env } from "../lib/config";
import { db } from "../lib/db";
import { verifiedSender } from "../lib/mail";
import { Lovable } from "../lib/lovable";
import { whop } from "../lib/commerce";
loadEnvConfig(process.cwd());
const missing = missingConfig();
if (missing.length)
  throw new Error(`Missing .env.local values: ${missing.join(", ")}`);
const tasks: [string, () => Promise<unknown>][] = [
  [
    "Docker build isolation",
    () =>
      promisify(execFile)("docker", ["info", "--format", "{{.ServerVersion}}"]),
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
      const { error } = await db().from("runs").select("id").limit(1);
      if (error) throw error;
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
  ["Verified email sender", verifiedSender],
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
        console.log(
          "  Tool schemas:",
          JSON.stringify(
            lovable.tools
              .filter((t) =>
                [
                  "create_project",
                  "deploy_project",
                  "list_files",
                  "read_file",
                ].includes(t.name),
              )
              .map((t) => ({ name: t.name, inputSchema: t.inputSchema })),
          ),
        );
      } finally {
        await lovable.close();
      }
    },
  ],
];
let failed = false;
for (const [name, test] of tasks) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(
      `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
if (failed) process.exitCode = 1;
