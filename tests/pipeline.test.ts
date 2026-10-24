import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  rows: vi.fn(),
  event: vi.fn(),
  reserve: vi.fn(),
  inspect: vi.fn(),
  exportSite: vi.fn(),
  listProduct: vi.fn(),
  sendMail: vi.fn(),
  call: vi.fn(),
  research: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  insert: f.insert,
  update: f.update,
  rows: f.rows,
  event: f.event,
  db: () => ({
    rpc: f.reserve,
    from: () => ({
      select: () => ({
        ilike: () => ({ eq: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
}));
vi.mock("../lib/research", () => ({
  discover: async () => [
    {
      id: "place-test",
      displayName: { text: "Test Venue" },
      formattedAddress: "Test address",
    },
  ],
  research: f.research,
}));
vi.mock("../lib/audit", () => ({ inspect: f.inspect }));
vi.mock("../lib/export", () => ({ exportSite: f.exportSite }));
vi.mock("../lib/commerce", () => ({ listProduct: f.listProduct }));
vi.mock("../lib/mail", () => ({
  verifiedSender: async () => {},
  optoutUrl: () => "https://operator.test/opt-out",
  sendMail: f.sendMail,
}));
vi.mock("../lib/lovable", () => ({
  Lovable: class {
    async connect() {}
    call = f.call;
    async close() {}
  },
}));
import { runPipeline } from "../worker/pipeline";
import type { RunInput } from "../lib/config";
const params: RunInput = {
  area: "Test area",
  radiusMeters: 1300,
  types: ["cafe"],
  maxBusinesses: 1,
  siteScoreThreshold: 45,
  maxSitesToBuild: 1,
  maxRealEmails: 1,
  maxLovableRepairAttempts: 2,
  maxEstimatedRunCostUsd: 25,
};
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    COST_PLACES_SEARCH_USD: ".04",
    COST_EXA_SEARCH_USD: ".01",
    COST_MODEL_RESEARCH_USD: ".1",
    COST_LOVABLE_BUILD_USD: "3",
    COST_LOVABLE_REPAIR_USD: "1",
    SALE_PRICE_USD: "199",
    PAYMENT_FEE_PERCENT: "3",
    PAYMENT_FEE_FIXED_USD: ".3",
    SENDER_NAME: "Test sender",
    SENDER_POSTAL_ADDRESS: "Test postal address",
  }))
    vi.stubEnv(key, value);
  f.reserve.mockResolvedValue({ data: true, error: null });
  f.rows.mockResolvedValue([]);
  f.insert.mockImplementation(async (table, values) => ({
    ...values,
    id: `${table}-test`,
  }));
  f.research.mockResolvedValue({
    name: "Test Venue",
    category: "cafe",
    officialWebsite: null,
    websiteAbsent: true,
    ambiguous: false,
    chain: false,
    contactEmail: "venue@example.com",
    contactSource: "https://example.com/contact",
    facts: [
      {
        label: "Name",
        value: "Test Venue",
        source: "https://example.com",
        confidence: "high",
      },
      {
        label: "Location",
        value: "123 Test Street",
        source: "https://example.com",
        confidence: "high",
      },
      {
        label: "Contact",
        value: "venue@example.com",
        source: "https://example.com/contact",
        confidence: "high",
      },
    ],
    direction: "Clean",
  });
  f.inspect.mockResolvedValue({
    score: 90,
    passed: true,
    defects: [],
    screenshot_url: "https://assets.example/test.png",
  });
  f.call.mockImplementation(async (name) =>
    name === "create_project"
      ? { project_id: "project-test", preview_url: "https://concept.example" }
      : { url: "https://published.example" },
  );
  f.exportSite.mockResolvedValue({
    zip_path: "private/source.zip",
    checksum: "test-checksum",
    build_log: "test-build",
  });
  f.listProduct.mockResolvedValue({
    storefront_url: "https://whop.com/test/test-product/",
    purchase_url: "https://whop.com/test/checkout/plan_test",
  });
  f.sendMail.mockResolvedValue("message-test");
});
afterEach(() => vi.unstubAllEnvs());
describe("orchestrator safety gates with isolated provider adapters", () => {
  it("stops a broken preview after exactly two repairs, before ZIP/listing/email", async () => {
    f.inspect.mockResolvedValue({
      score: 20,
      passed: false,
      defects: ["overflow"],
    });
    await runPipeline({ id: "run-test", params });
    expect(
      f.call.mock.calls.filter(([name]) => name === "send_message"),
    ).toHaveLength(2);
    expect(f.exportSite).not.toHaveBeenCalled();
    expect(f.listProduct).not.toHaveBeenCalled();
    expect(f.sendMail).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenCalledWith(
      "businesses",
      "businesses-test",
      expect.objectContaining({ state: "FAILED", failure_stage: "BUILDING" }),
    );
  });
  it("never creates a Whop product when source export/build fails", async () => {
    f.exportSite.mockRejectedValue(new Error("clean build failed"));
    await runPipeline({ id: "run-test", params });
    expect(f.listProduct).not.toHaveBeenCalled();
    expect(f.sendMail).not.toHaveBeenCalled();
  });
  it("never emails a product whose storefront validation failed", async () => {
    f.listProduct.mockRejectedValue(new Error("incorrect storefront price"));
    await runPipeline({ id: "run-test", params });
    expect(f.sendMail).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "EMAIL_SENT",
    });
  });
  it("records email failure instead of a successful send", async () => {
    f.sendMail.mockRejectedValue(new Error("provider rejected"));
    await runPipeline({ id: "run-test", params });
    expect(f.update).toHaveBeenCalledWith("emails", "emails-test", {
      status: "EMAIL_FAILED",
    });
    expect(f.update).not.toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "EMAIL_SENT",
    });
  });
  it("enforces a zero outbound email cap while retaining the finished product", async () => {
    await runPipeline({
      id: "run-test",
      params: { ...params, maxRealEmails: 0 },
    });
    expect(f.listProduct).toHaveBeenCalledOnce();
    expect(f.sendMail).not.toHaveBeenCalled();
  });
  it("does not generate or email businesses with no contact", async () => {
    const brief = await f.research();
    f.research.mockResolvedValue({
      ...brief,
      contactEmail: null,
      contactSource: null,
    });
    await runPipeline({ id: "run-test", params });
    expect(f.update).toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "NO_CONTACT",
    });
    expect(f.call).not.toHaveBeenCalled();
    expect(f.sendMail).not.toHaveBeenCalled();
  });
  it("records SENT only with the provider message acknowledgement", async () => {
    await runPipeline({ id: "run-test", params });
    expect(f.sendMail).toHaveBeenCalledOnce();
    expect(f.update).toHaveBeenCalledWith(
      "emails",
      "emails-test",
      expect.objectContaining({
        status: "SENT",
        provider_message_id: "message-test",
      }),
    );
    expect(f.update).toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "EMAIL_SENT",
    });
  });
  it("does not call providers when the first spending reservation is refused", async () => {
    f.reserve.mockResolvedValue({ data: false, error: null });
    await expect(runPipeline({ id: "run-test", params })).rejects.toThrow(
      "spending cap",
    );
    expect(f.research).not.toHaveBeenCalled();
    expect(f.call).not.toHaveBeenCalled();
  });
});
