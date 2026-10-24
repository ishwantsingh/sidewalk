import { afterEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { sameOrigin } from "../lib/origin";
import { salesSignature, validSalesSignature } from "../lib/sales-access";
import { publicUrl } from "../lib/http";
import { GET, POST } from "../app/api/[...path]/route";
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllEnvs());
describe("dashboard access", () => {
  it("serves configuration directly without authentication", async () => {
    const r = await GET(
      new Request("https://app.test/api/config"),
      context("config"),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await r.json()).missing).toBeInstanceOf(Array);
  });
  it("removes the session endpoint", async () => {
    const r = await POST(
      new Request("https://app.test/api/session", { method: "POST" }),
      context("session"),
    );
    expect(r.status).toBe(404);
  });
  it("blocks cross-origin mutations", () => {
    vi.stubEnv("APP_URL", "https://app.test");
    expect(
      sameOrigin(
        new Request("https://app.test", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toBe(false);
  });
  it("does not accept a missing configuration as a successful start", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const r = await POST(
      new Request("http://localhost/api/runs", { method: "POST" }),
      context("runs"),
    );
    expect(r.status).toBe(503);
  });
});
describe("buyer security", () => {
  it("binds private sales briefs to their assignment", () => {
    vi.stubEnv("DOWNLOAD_SIGNING_SECRET", "test-signing-secret");
    const sig = salesSignature("123");
    expect(validSalesSignature("123", sig)).toBe(true);
    expect(validSalesSignature("124", sig)).toBe(false);
    expect(validSalesSignature("123", "")).toBe(false);
  });
  it("verifies the exact Whop webhook bytes, rejecting tampering", () => {
    const secret = "ws_unit-test-webhook-secret-32bytes";
    const webhook = new Webhook(secret, { format: "raw" });
    const payload = JSON.stringify({
      id: "msg_1",
      type: "payment.succeeded",
      data: { id: "pay_1" },
    });
    const now = new Date();
    const headers = {
      "webhook-id": "msg_1",
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": webhook.sign("msg_1", now, payload),
    };
    expect(unwrapWebhook(payload, { headers, key: secret })).toEqual(
      JSON.parse(payload),
    );
    expect(() =>
      unwrapWebhook(payload + " ", { headers, key: secret }),
    ).toThrow();
  });
  it("rejects invalid webhook requests before reading payment data", async () => {
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "test");
    const r = await POST(
      new Request("https://app.test/api/webhooks/whop", {
        method: "POST",
        body: "{}",
      }),
      context("webhooks", "whop"),
    );
    expect(r.status).toBe(401);
  });
});
describe("untrusted source URLs", () => {
  it.each([
    "http://127.0.0.1",
    "http://[::1]",
    "http://169.254.169.254",
    "http://10.0.0.1",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "http://127.0.0.1:3000",
  ])("rejects %s", async (url) => {
    await expect(publicUrl(url)).rejects.toThrow();
  });
});
