import { WhopClient } from "@whop/sdk";
import { env } from "./config";

// Shared by the web API and worker; keep browser automation out of this module.
export function whop(key?: string) {
  return new WhopClient({
    token: env("WHOP_API_KEY"),
    apiVersionDate: "2026-10-15-1",
    ...(key ? { idempotencyKey: key } : {}),
  });
}
