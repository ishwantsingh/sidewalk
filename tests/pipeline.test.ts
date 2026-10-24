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
  queueSalesTask: vi.fn(),
  sendOutreach: vi.fn(),
  call: vi.fn(),
  waitForBuild: vi.fn(),
  research: vi.fn(),
  discover: vi.fn(),
  collectBusinessContent: vi.fn(),
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
  discover: f.discover,
  research: f.research,
}));
vi.mock("../lib/publication", () => ({
  waitForPublication: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/business-content", () => ({
  collectBusinessContent: f.collectBusinessContent,
  businessContentCost: () => 0.55,
}));
vi.mock("../lib/audit", () => ({ inspect: f.inspect }));
vi.mock("../lib/export", () => ({ exportSite: f.exportSite }));
vi.mock("../lib/commerce", () => ({ listProduct: f.listProduct }));
vi.mock("../lib/outreach", () => ({ sendOutreach: f.sendOutreach }));
vi.mock("../lib/sales", () => ({ queueSalesTask: f.queueSalesTask }));
vi.mock("../lib/lovable", () => ({
  Lovable: class {
    async connect() {}
    call = f.call;
    waitForBuild = f.waitForBuild;
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
  maxSitesToBuild: 1,
  maxRealEmails: 1,
  maxSalesTasks: 1,
  requireEmailAndPhone: false,
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
    SENDER_NAME: "Test sender",
    TERAC_MAX_TASK_COST_USD: "20",
  }))
    vi.stubEnv(key, value);
  f.reserve.mockResolvedValue({ data: true, error: null });
  f.collectBusinessContent.mockResolvedValue({
    collectedAt: "2026-10-24T12:00:00Z",
    testimonials: [],
    photos: [],
    menuImages: [],
    visualDirection: "Warm and inviting",
    issues: [],
  });
  f.rows.mockResolvedValue([]);
  f.discover.mockResolvedValue([
    {
      id: "place-test",
      displayName: { text: "Test Venue" },
      formattedAddress: "Test address",
    },
  ]);
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
    contactPhone: "+1 212 555 0100",
    phoneSource: "https://example.com/contact",
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
      ? { projectId: "project-test", message_id: "message-test" }
      : { url: "https://published.example" },
  );
  f.waitForBuild.mockResolvedValue({
    url: "https://concept.example",
    ref: "a".repeat(40),
  });
  f.exportSite.mockResolvedValue({
    zip_path: "private/source.zip",
    checksum: "test-checksum",
    build_log: "test-build",
  });
  f.listProduct.mockResolvedValue({
    storefront_url: "https://whop.com/test/test-product/",
    purchase_url: "https://whop.com/test/checkout/plan_test",
  });
  f.queueSalesTask.mockResolvedValue(undefined);
  f.sendOutreach.mockResolvedValue({
    status: "SENT",
    subject: "Website concept",
    body: "Preview and checkout",
    providerMessageId: "email-1",
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("orchestrator safety gates with isolated provider adapters", () => {
  it("collects and persists sourced content before creating the Lovable project", async () => {
    const content = {
      collectedAt: "2026-10-24T12:00:00Z",
      testimonials: [
        {
          quote: "Lovely coffee",
          author: "Sam",
          rating: 5,
          source: "https://maps.google.com/review/1",
          authorUri: null,
          publishedAt: null,
        },
      ],
      photos: [],
      menuImages: [],
      visualDirection: "Warm timber",
      issues: [],
    };
    f.collectBusinessContent.mockResolvedValue(content);
    await runPipeline({ id: "run-test", params });
    expect(f.collectBusinessContent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Venue" }),
      "place-test",
    );
    const saved = f.update.mock.calls.find(
      ([table, , values]) => table === "businesses" && values.brief?.content,
    );
    expect(saved?.[2].brief.content).toEqual(content);
    const creation = f.call.mock.calls.find(
      ([name]) => name === "create_project",
    )!;
    expect(creation[1].initial_message).toContain("Lovely coffee");
    expect(creation[1].initial_message).not.toContain("noindex");
    expect(creation[1].initial_message).not.toContain(
      "Unofficial concept, not affiliated with this business",
    );
    expect(
      f.update.mock.invocationCallOrder[f.update.mock.calls.indexOf(saved!)],
    ).toBeLessThan(f.call.mock.invocationCallOrder[0]);
    expect(
      f.reserve.mock.calls.some(
        ([, args]) => args.p_action === "BUSINESS_CONTENT",
      ),
    ).toBe(true);
  });
  it("does not pay for a Lovable build when content inspection fails", async () => {
    f.collectBusinessContent.mockRejectedValue(
      new Error("Photo inspection failed"),
    );
    await runPipeline({ id: "run-test", params });
    expect(f.call).not.toHaveBeenCalled();
    expect(
      f.reserve.mock.calls.some(
        ([, args]) => args.p_action === "LOVABLE_BUILD",
      ),
    ).toBe(false);
    expect(f.exportSite).not.toHaveBeenCalled();
  });
  it("persists the project before waiting and never audits or sells a paused build", async () => {
    f.waitForBuild.mockImplementation(async () => {
      expect(f.insert).toHaveBeenCalledWith(
        "sites",
        expect.objectContaining({ lovable_project_id: "project-test" }),
      );
      expect(f.inspect).not.toHaveBeenCalled();
      throw new Error("Lovable build paused for input");
    });
    await runPipeline({ id: "run-test", params });
    expect(f.waitForBuild).toHaveBeenCalledOnce();
    expect(f.inspect).not.toHaveBeenCalled();
    expect(f.exportSite).not.toHaveBeenCalled();
    expect(f.listProduct).not.toHaveBeenCalled();
    expect(f.sendOutreach).not.toHaveBeenCalled();
    expect(f.queueSalesTask).not.toHaveBeenCalled();
  });
  it("waits for repairs and exports the final ready revision", async () => {
    f.inspect.mockResolvedValueOnce({ passed: false, defects: ["overflow"] });
    f.waitForBuild
      .mockResolvedValueOnce({
        url: "https://initial.example",
        ref: "a".repeat(40),
      })
      .mockResolvedValueOnce({
        url: "https://repaired.example",
        ref: "b".repeat(40),
      });
    await runPipeline({ id: "run-test", params });
    expect(f.waitForBuild).toHaveBeenCalledTimes(2);
    expect(f.inspect.mock.calls.map(([url]) => url)).toEqual([
      "https://published.example",
      "https://published.example",
    ]);
    expect(f.exportSite).toHaveBeenCalledWith(
      expect.anything(),
      "project-test",
      "sites-test",
      "Test Venue",
      "b".repeat(40),
    );
  });
  it.each(["contactEmail", "contactSource", "contactPhone", "phoneSource"])(
    "skips building when the dual-contact option is enabled and %s is missing",
    async (field) => {
      f.research.mockResolvedValue({ ...(await f.research()), [field]: null });
      await runPipeline({
        id: "run-test",
        params: { ...params, requireEmailAndPhone: true },
      });
      expect(f.call).not.toHaveBeenCalled();
      expect(f.event).toHaveBeenCalledWith(
        "run-test",
        "businesses-test",
        "CONTACT_REQUIREMENT_NOT_MET",
        expect.any(String),
      );
      expect(f.event).toHaveBeenCalledWith(
        "run-test",
        null,
        "NO_QUALIFIED_BUSINESSES",
        expect.any(String),
      );
      expect(f.sendOutreach).not.toHaveBeenCalled();
      expect(f.queueSalesTask).not.toHaveBeenCalled();
    },
  );
  it("builds a prospect with both sourced contacts when the option is enabled", async () => {
    await runPipeline({
      id: "run-test",
      params: { ...params, requireEmailAndPhone: true },
    });
    expect(f.sendOutreach).toHaveBeenCalledOnce();
    expect(f.queueSalesTask).toHaveBeenCalledOnce();
  });
  it("stops a broken preview after exactly two repairs, before ZIP/listing/sales", async () => {
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
    expect(f.queueSalesTask).not.toHaveBeenCalled();
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
    expect(f.queueSalesTask).not.toHaveBeenCalled();
  });
  it("never assigns a salesperson for a product whose storefront validation failed", async () => {
    f.listProduct.mockRejectedValue(new Error("incorrect storefront price"));
    await runPipeline({ id: "run-test", params });
    expect(f.queueSalesTask).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "SALES_QUEUED",
    });
  });
  it("records sales handoff failure instead of a successful assignment", async () => {
    f.queueSalesTask.mockRejectedValue(new Error("provider rejected"));
    await runPipeline({ id: "run-test", params });
    expect(f.update).toHaveBeenCalledWith(
      "businesses",
      "businesses-test",
      expect.objectContaining({
        state: "FAILED",
        failure_stage: "SALES_HANDOFF",
      }),
    );
    expect(f.update).not.toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "SALES_QUEUED",
    });
  });
  it("enforces a zero sales-assignment cap while retaining the finished product", async () => {
    await runPipeline({
      id: "run-test",
      params: { ...params, maxSalesTasks: 0 },
    });
    expect(f.listProduct).toHaveBeenCalledOnce();
    expect(f.queueSalesTask).not.toHaveBeenCalled();
  });
  it("emails an email-only business without recruiting a caller", async () => {
    f.research.mockResolvedValue({
      ...(await f.research()),
      contactPhone: null,
      phoneSource: null,
    });
    await runPipeline({ id: "run-test", params });
    expect(f.sendOutreach).toHaveBeenCalledOnce();
    expect(f.queueSalesTask).not.toHaveBeenCalled();
  });
  it("does not build a business lacking both contact channels", async () => {
    f.research.mockResolvedValue({
      ...(await f.research()),
      contactPhone: null,
      phoneSource: null,
      contactEmail: null,
      contactSource: null,
    });
    await runPipeline({ id: "run-test", params });
    expect(f.update).toHaveBeenCalledWith("businesses", "businesses-test", {
      state: "NO_CONTACT",
    });
    expect(f.sendOutreach).not.toHaveBeenCalled();
    expect(f.queueSalesTask).not.toHaveBeenCalled();
  });
  it("recruits a caller even if the email adapter fails", async () => {
    f.sendOutreach.mockRejectedValue(new Error("email provider unavailable"));
    await runPipeline({ id: "run-test", params });
    expect(f.queueSalesTask).toHaveBeenCalledWith(
      "run-test",
      "businesses-test",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: "EMAIL_FAILED" }),
    );
  });
  it("still sends email when recruitment fails", async () => {
    f.queueSalesTask.mockRejectedValue(new Error("Terac unavailable"));
    await runPipeline({ id: "run-test", params });
    expect(f.sendOutreach).toHaveBeenCalledOnce();
  });
  it("honors an email-only cap independently of sales calls", async () => {
    await runPipeline({
      id: "run-test",
      params: { ...params, maxRealEmails: 0 },
    });
    expect(f.sendOutreach).not.toHaveBeenCalled();
    expect(f.queueSalesTask).toHaveBeenCalledWith(
      "run-test",
      "businesses-test",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { status: "SEND_LIMIT" },
    );
  });
  it("hands the verified live website and exact Whop listing to the salesperson", async () => {
    await runPipeline({ id: "run-test", params });
    expect(f.queueSalesTask).toHaveBeenCalledOnce();
    expect(f.queueSalesTask).toHaveBeenCalledWith(
      "run-test",
      "businesses-test",
      expect.objectContaining({ contactPhone: "+1 212 555 0100" }),
      expect.objectContaining({
        preview_url: "https://published.example",
        qa_status: "PASSED",
        zip_path: "private/source.zip",
      }),
      expect.objectContaining({
        storefront_url: "https://whop.com/test/test-product/",
      }),
      expect.anything(),
      expect.objectContaining({
        status: "SENT",
        subject: "Website concept",
        providerMessageId: "email-1",
      }),
    );
  });
  it("qualifies a business with a sourced phone even without an email address", async () => {
    f.research.mockResolvedValue({
      ...(await f.research()),
      contactEmail: null,
      contactSource: null,
    });
    await runPipeline({ id: "run-test", params });
    expect(f.queueSalesTask).toHaveBeenCalledOnce();
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

it("retries research and audits in place without duplicating the business", async () => {
  const prior = {
    id: "existing",
    run_id: "run-test",
    name: "Test Venue",
    state: "REJECTED",
  };
  f.rows.mockImplementation(async (table, column) => {
    if (table === "businesses") return [prior];
    if (table === "audits") return [{ id: "audit-existing" }];
    if (table === "opportunities") return [{ id: "opportunity-existing" }];
    return [];
  });
  await runPipeline({ id: "run-test", params }, { retryPreBuild: true });
  expect(
    f.insert.mock.calls.filter(([table]) =>
      ["businesses", "audits", "opportunities"].includes(table),
    ),
  ).toHaveLength(0);
  expect(f.update).toHaveBeenCalledWith(
    "audits",
    "audit-existing",
    expect.objectContaining({ classification: "NO_WEBSITE" }),
  );
  expect(f.sendOutreach).toHaveBeenCalledOnce();
});
it("never replays an existing site during a prebuild retry", async () => {
  f.rows.mockImplementation(async (table) =>
    table === "businesses"
      ? [{ id: "existing", run_id: "run-test" }]
      : table === "sites"
        ? [{ id: "site-existing" }]
        : [],
  );
  await runPipeline({ id: "run-test", params }, { retryPreBuild: true });
  expect(f.research).not.toHaveBeenCalled();
  expect(f.call).not.toHaveBeenCalled();
  expect(f.sendOutreach).not.toHaveBeenCalled();
  expect(f.event).toHaveBeenCalledWith(
    "run-test",
    "existing",
    "FAILED",
    "Cannot retry a business after site creation",
  );
});

describe("explicit business selection", () => {
  async function selectedSetup() {
    const brief = await f.research();
    f.research.mockClear();
    const business = {
      id: "selected-business",
      run_id: "prior-run",
      brief,
      state: "REJECTED",
    };
    const audit = {
      score: 51,
      classification: "GOOD_WEBSITE",
      defects: ["Mobile overflow", "Missing metadata"],
    };
    f.rows.mockImplementation(async (table) => {
      if (table === "businesses") return [business];
      if (table === "audits") return [audit];
      if (table === "opportunities")
        return [{ priority: 40, quoted_price: 199 }];
      return [];
    });
    return { business, audit };
  }
  it("builds a deliberately selected prospect without changing its actual audit or rerunning discovery", async () => {
    const { audit } = await selectedSetup();
    await runPipeline({
      id: "run-test",
      params: {
        ...params,
        selectedBusinessId: "selected-business",
        requireEmailAndPhone: true,
      },
    });
    expect(f.research).not.toHaveBeenCalled();
    expect(
      f.update.mock.calls.filter(([table]) => table === "audits"),
    ).toHaveLength(0);
    expect(
      f.reserve.mock.calls.some(([, { p_action }]) => p_action === "DISCOVERY"),
    ).toBe(false);
    expect(f.sendOutreach).toHaveBeenCalledWith(
      "run-test",
      "selected-business",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      audit,
    );
    expect(f.queueSalesTask).toHaveBeenCalledOnce();
    expect(f.event).toHaveBeenCalledWith(
      "run-test",
      "selected-business",
      "BUSINESS_SELECTED",
      expect.stringContaining("GOOD_WEBSITE, 51/100"),
    );
  });
  it("refuses a selected business with an earlier ambiguous billable attempt", async () => {
    await selectedSetup();
    const implementation = f.rows.getMockImplementation()!;
    f.rows.mockImplementation(async (...args) =>
      args[0] === "events"
        ? [{ action: "LOVABLE_BUILD" }]
        : implementation(...args),
    );
    await expect(
      runPipeline({
        id: "run-test",
        params: { ...params, selectedBusinessId: "selected-business" },
      }),
    ).rejects.toThrow("already has a build attempt");
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.call).not.toHaveBeenCalled();
  });
  it("retains the verified-identity gate for selected businesses", async () => {
    const { business } = await selectedSetup();
    business.brief.facts = business.brief.facts.filter(
      (fact: any) => fact.label !== "Location",
    );
    await expect(
      runPipeline({
        id: "run-test",
        params: { ...params, selectedBusinessId: "selected-business" },
      }),
    ).rejects.toThrow("verified identity");
    expect(f.call).not.toHaveBeenCalled();
  });
});

describe("existing generated-site recovery", () => {
  async function recoverySetup(extraHistory: string[] = []) {
    const brief = await f.research();
    f.rows.mockImplementation(async (table) => {
      if (table === "businesses")
        return [{ id: "existing", state: "FAILED", brief }];
      if (table === "audits")
        return [
          {
            score: 51,
            classification: "GOOD_WEBSITE",
            defects: ["overflow", "metadata"],
          },
        ];
      if (table === "opportunities")
        return [{ priority: 40, quoted_price: 199 }];
      if (table === "sites")
        return [
          { id: "site-existing", lovable_project_id: "project-existing" },
        ];
      if (table === "events")
        return [
          "LOVABLE_BUILD",
          "LOVABLE_REPAIR",
          "LOVABLE_REPAIR",
          ...extraHistory,
        ].map((action) => ({ action }));
      return [];
    });
  }
  it("publishes and audits the same completed project without creating another site or generation", async () => {
    await recoverySetup();
    await runPipeline(
      { id: "run-test", params: { ...params, selectedBusinessId: "existing" } },
      { resumeExistingSite: true },
    );
    expect(f.waitForBuild).toHaveBeenCalledWith("project-existing", {
      status: "completed",
    });
    expect(f.call.mock.calls.map(([name]) => name)).toEqual(["deploy_project"]);
    expect(f.inspect.mock.calls.map(([url]) => url)).toEqual([
      "https://published.example",
    ]);
    expect(f.exportSite).toHaveBeenCalledWith(
      expect.anything(),
      "project-existing",
      "site-existing",
      "Test Venue",
      "a".repeat(40),
    );
    expect(f.insert.mock.calls.some(([table]) => table === "sites")).toBe(
      false,
    );
    expect(f.sendOutreach).toHaveBeenCalledOnce();
  });
  it("does not exceed the original repair limit during recovery", async () => {
    await recoverySetup();
    f.inspect.mockResolvedValue({ passed: false, defects: ["layout"] });
    await runPipeline(
      { id: "run-test", params: { ...params, selectedBusinessId: "existing" } },
      { resumeExistingSite: true },
    );
    expect(f.call.mock.calls.map(([name]) => name)).toEqual(["deploy_project"]);
    expect(f.exportSite).not.toHaveBeenCalled();
    expect(f.sendOutreach).not.toHaveBeenCalled();
  });
  it("refuses an ambiguous earlier product creation even when no product row exists", async () => {
    await recoverySetup(["WHOP_CREATE_ATTEMPT"]);
    await expect(
      runPipeline(
        {
          id: "run-test",
          params: { ...params, selectedBusinessId: "existing" },
        },
        { resumeExistingSite: true },
      ),
    ).rejects.toThrow("before any product");
    expect(f.call).not.toHaveBeenCalled();
    expect(f.sendOutreach).not.toHaveBeenCalled();
  });
});

it("reuses QA only for the unchanged recorded source revision and rechecks public availability", async () => {
  const brief = await f.research();
  f.rows.mockImplementation(async (table) => {
    if (table === "businesses")
      return [{ id: "existing", state: "FAILED", brief }];
    if (table === "audits")
      return [
        {
          score: 51,
          classification: "GOOD_WEBSITE",
          defects: ["overflow", "metadata"],
        },
      ];
    if (table === "opportunities") return [{ priority: 40, quoted_price: 199 }];
    if (table === "sites")
      return [
        {
          id: "site-existing",
          lovable_project_id: "project-existing",
          qa_status: "PASSED",
          screenshot_url: "https://assets.example/qa.png",
          preview_url: "https://published.example",
        },
      ];
    if (table === "events")
      return [
        {
          action: "LOVABLE_BUILD_READY",
          reason: "Build completed at commit " + "a".repeat(40),
          created_at: "2026-10-24T10:00:00Z",
        },
        {
          action: "PREVIEW_READY",
          reason: "Passed",
          created_at: "2026-10-24T10:01:00Z",
        },
      ];
    return [];
  });
  await runPipeline(
    { id: "run-test", params: { ...params, selectedBusinessId: "existing" } },
    { resumeExistingSite: true },
  );
  expect(f.inspect).not.toHaveBeenCalled();
  expect(f.call).not.toHaveBeenCalled();
  expect(
    f.reserve.mock.calls.some(
      ([, { p_action }]) => p_action === "PUBLISHED_QA",
    ),
  ).toBe(false);
  expect(f.sendOutreach).toHaveBeenCalledOnce();
});

describe("recovery after a rejected Whop listing", () => {
  async function setup(
    clearedAt: string,
    clearedBy = "WHOP_ATTEMPT_ABSENT",
    products: Record<string, unknown>[] = [],
  ) {
    const brief = await f.research();
    f.rows.mockImplementation(async (table) => {
      if (table === "businesses")
        return [{ id: "existing", state: "FAILED", brief }];
      if (table === "audits")
        return [
          {
            score: 51,
            classification: "GOOD_WEBSITE",
            defects: ["overflow", "metadata"],
          },
        ];
      if (table === "opportunities")
        return [{ priority: 40, quoted_price: 199 }];
      if (table === "sites")
        return [
          {
            id: "site-existing",
            lovable_project_id: "project-existing",
            qa_status: "PASSED",
            screenshot_url: "https://assets.example/qa.png",
            preview_url: "https://published.example",
            zip_path: "site-existing/test-venue-website.zip",
            checksum: "b".repeat(64),
          },
        ];
      if (table === "products") return products;
      if (table === "events")
        return [
          ["LOVABLE_BUILD_READY", "2026-10-24T10:00:00Z"],
          ["PREVIEW_READY", "2026-10-24T10:01:00Z"],
          ["ZIP_READY", "2026-10-24T10:02:00Z"],
          ["WHOP_CREATE_ATTEMPT", "2026-10-24T10:03:00Z"],
          [clearedBy, clearedAt],
        ].map(([action, created_at]) => ({
          action,
          created_at,
          reason: "Build completed at commit " + "a".repeat(40),
        }));
      return [];
    });
  }
  const resume = () =>
    runPipeline(
      { id: "run-test", params: { ...params, selectedBusinessId: "existing" } },
      { resumeExistingSite: true },
    );
  it("retries the listing with the verified ZIP once the provider shows no product", async () => {
    await setup("2026-10-24T10:04:00Z");
    await resume();
    expect(f.exportSite).not.toHaveBeenCalled();
    expect(f.listProduct).toHaveBeenCalledOnce();
    expect(f.sendOutreach).toHaveBeenCalledOnce();
  });
  it("still refuses when the absence check predates the latest attempt", async () => {
    await setup("2026-10-24T09:59:00Z");
    await expect(resume()).rejects.toThrow("before any product");
    expect(f.listProduct).not.toHaveBeenCalled();
  });
  it("completes its own unpublished listing in place", async () => {
    await setup("2026-10-24T10:04:00Z", "WHOP_PARTIAL_RESUMABLE", [
      { id: "product-row", whop_product_id: "prod_1", verified: false },
    ]);
    await resume();
    expect(f.listProduct).toHaveBeenCalledOnce();
    expect(f.sendOutreach).toHaveBeenCalledOnce();
  });
  it("refuses recovery once a verified listing exists", async () => {
    await setup("2026-10-24T10:04:00Z", "WHOP_PARTIAL_RESUMABLE", [
      { id: "product-row", whop_product_id: "prod_1", verified: true },
    ]);
    await expect(resume()).rejects.toThrow("Refusing recovery");
    expect(f.listProduct).not.toHaveBeenCalled();
  });
});

describe("simple hackathon selection", () => {
  it("builds with two medium-confidence identity facts and a $45 sales allowance", async () => {
    vi.stubEnv("TERAC_MAX_TASK_COST_USD", "45");
    const brief = await f.research();
    brief.facts = brief.facts
      .slice(0, 2)
      .map((fact: any) => ({ ...fact, confidence: "medium" }));
    f.research.mockResolvedValue(brief);
    await runPipeline({
      id: "run-test",
      params: { ...params, maxEstimatedRunCostUsd: 75 },
    });
    expect(f.listProduct).toHaveBeenCalledOnce();
    expect(f.reserve).toHaveBeenCalledWith(
      "reserve_cost",
      expect.objectContaining({ p_action: "TERAC_SALES_BUDGET", p_cost: 45 }),
    );
    const opportunity = f.insert.mock.calls.find(
      ([table]) => table === "opportunities",
    )?.[1];
    expect(opportunity).not.toHaveProperty("purchase_probability");
    expect(opportunity).not.toHaveProperty("expected_contribution");
  });
  it.each(["contactSource", "phoneSource"])(
    "rejects a sole contact without %s",
    async (field) => {
      const brief = await f.research();
      if (field === "contactSource") brief.contactPhone = null;
      else brief.contactEmail = null;
      brief[field] = null;
      f.research.mockResolvedValue(brief);
      await runPipeline({ id: "run-test", params });
      expect(f.call).not.toHaveBeenCalled();
    },
  );
  it("selects no-website businesses ahead of weak sites regardless of discovery order", async () => {
    const brief = await f.research();
    f.discover.mockResolvedValue([
      {
        id: "weak",
        displayName: { text: "Weak" },
        formattedAddress: "Address",
      },
      {
        id: "absent",
        displayName: { text: "Absent" },
        formattedAddress: "Address",
      },
    ]);
    f.research
      .mockResolvedValueOnce({
        ...brief,
        name: "Weak",
        officialWebsite: "https://weak.example",
        websiteAbsent: false,
      })
      .mockResolvedValueOnce({
        ...brief,
        name: "Absent",
        contactEmail: null,
        contactSource: null,
      });
    f.inspect.mockResolvedValueOnce({
      score: 60,
      defects: ["Missing contact link"],
    });
    await runPipeline({
      id: "run-test",
      params: { ...params, maxBusinesses: 2 },
    });
    expect(f.collectBusinessContent).toHaveBeenCalledOnce();
    expect(f.collectBusinessContent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Absent" }),
      "absent",
    );
  });
  it("automatically builds a weak site with just one defect", async () => {
    f.research.mockResolvedValue({
      ...(await f.research()),
      officialWebsite: "https://weak.example",
      websiteAbsent: false,
    });
    f.inspect.mockResolvedValueOnce({
      score: 85,
      defects: ["Mobile overflow"],
    });
    await runPipeline({ id: "run-test", params });
    expect(f.listProduct).toHaveBeenCalledOnce();
  });
  it("reconsiders a previously rejected unbuilt lead without duplicating its records", async () => {
    f.rows.mockImplementation(async (table, field) => {
      if (table === "businesses" && field === "place_id")
        return [{ id: "old-business", run_id: "old-run" }];
      if (table === "audits") return [{ id: "old-audit" }];
      if (table === "opportunities") return [{ id: "old-opportunity" }];
      return [];
    });
    await runPipeline({ id: "run-test", params });
    expect(
      f.insert.mock.calls.some(([table]) =>
        ["businesses", "audits", "opportunities"].includes(table),
      ),
    ).toBe(false);
    expect(f.update).toHaveBeenCalledWith(
      "businesses",
      "old-business",
      expect.objectContaining({ run_id: "run-test" }),
    );
    expect(f.listProduct).toHaveBeenCalledOnce();
  });
  it("never automatically reconsiders a prior billable build attempt", async () => {
    f.rows.mockImplementation(async (table) =>
      table === "businesses"
        ? [{ id: "old-business" }]
        : table === "events"
          ? [{ action: "LOVABLE_BUILD" }]
          : [],
    );
    await runPipeline({ id: "run-test", params });
    expect(f.research).not.toHaveBeenCalled();
    expect(f.call).not.toHaveBeenCalled();
  });
});
