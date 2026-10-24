import { WhopClient } from "@whop/sdk";
import { env } from "./config";

// Shared by the web API and worker; keep browser automation out of this module.
// Pass idempotency keys per create request; a client-wide key is reused across different requests.
export function whop() {
  return new WhopClient({
    token: env("WHOP_API_KEY"),
    apiVersionDate: "2026-10-15-1",
  });
}
