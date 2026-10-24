import { beforeEach, afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  event: vi.fn(),
  sendMail: vi.fn(),
  verifiedSender: vi.fn(),
  suppression: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  insert: f.insert,
  update: f.update,
  event: f.event,
  db: () => ({
    from: () => ({ select: () => ({ ilike: () => ({ eq: f.suppression }) }) }),
  }),
}));
vi.mock("../lib/mail", () => ({
  sendMail: f.sendMail,
  verifiedSender: f.verifiedSender,
  optoutUrl: () => "https://app.test/opt-out",
}));
import { sendOutreach } from "../lib/outreach";
import type { Brief } from "../lib/research";
const brief = { name: "Test Cafe", contactEmail: "owner@cafe.test" } as Brief;
const site = { preview_url: "https://live.test" },
  product = { amount: 199, storefront_url: "https://whop.com/shop/cafe" },
  audit = { classification: "NO_WEBSITE" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SENDER_NAME", "Sidewalk AI");
  vi.stubEnv("SENDER_POSTAL_ADDRESS", "123 Test Street");
  f.insert.mockResolvedValue({ id: "email-1" });
  f.suppression.mockResolvedValue({ data: [], error: null });
  f.sendMail.mockResolvedValue("message-1");
});
afterEach(() => vi.unstubAllEnvs());
it("sends and persists the exact preview/Whop offer that the caller will receive", async () => {
  const result = await sendOutreach(
    "run-1",
    "biz-1",
    brief,
    site,
    product,
    audit,
  );
  expect(result.status).toBe("SENT");
  expect(result.providerMessageId).toBe("message-1");
  expect(result.body).toContain(site.preview_url);
  expect(result.body).toContain(product.storefront_url);
  expect(result.body).toContain("$199");
  expect(result.body).toContain("123 Test Street");
  expect(f.sendMail).toHaveBeenCalledWith(
    brief.contactEmail,
    result.subject,
    result.body,
    "outreach-email-1",
    expect.objectContaining({
      "List-Unsubscribe": "<https://app.test/opt-out>",
    }),
  );
  expect(f.update).toHaveBeenCalledWith(
    "emails",
    "email-1",
    expect.objectContaining({
      status: "SENT",
      provider_message_id: "message-1",
    }),
  );
});
it("retains the exact draft with an honest failed status for the caller", async () => {
  f.sendMail.mockRejectedValue(new Error("provider rejected"));
  const result = await sendOutreach(
    "run-1",
    "biz-1",
    brief,
    site,
    product,
    audit,
  );
  expect(result).toMatchObject({
    status: "EMAIL_FAILED",
    error: "provider rejected",
  });
  expect(result.subject).toContain("Test Cafe");
  expect(f.update).toHaveBeenCalledWith("emails", "email-1", {
    status: "EMAIL_FAILED",
    error: "provider rejected",
  });
});
it("honors a prior opt-out without sending or creating a new email", async () => {
  f.suppression.mockResolvedValue({ data: [{ id: "opted-out" }], error: null });
  expect(
    (await sendOutreach("run-1", "biz-1", brief, site, product, audit)).status,
  ).toBe("OPTED_OUT");
  expect(f.sendMail).not.toHaveBeenCalled();
  expect(f.insert).not.toHaveBeenCalled();
});
