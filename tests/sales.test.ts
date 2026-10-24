import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ToolSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import liveTools from "./fixtures/terac-tools.json";
const f = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  event: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  insert: f.insert,
  update: f.update,
  event: f.event,
  db: () => ({ from: f.from }),
}));
import {
  salesBrief,
  salesOpportunity,
  opportunityQuote,
  processSalesTask,
  queueSalesTask,
  callReportSchema,
  verifySalesSubmission,
} from "../lib/sales";
import { teracArguments, teracResult, type Terac } from "../lib/terac";
const brief = {
  name: "Test Cafe",
  category: "cafe",
  contactPhone: "+1 212 555 0100",
  phoneSource: "https://cafe.test/contact",
  contactEmail: null,
  contactSource: null,
  officialWebsite: null,
  websiteAbsent: true,
  chain: false,
  ambiguous: false,
  facts: [],
  direction: "Simple",
};
const site = {
  qa_status: "PASSED",
  zip_path: "private/site.zip",
  preview_url: "https://live.test",
};
const product = {
  verified: true,
  amount: 199,
  storefront_url: "https://whop.com/shop/site",
  purchase_url: "https://whop.com/checkout/plan_test",
};
const job = {
  id: "task-1",
  run_id: "run-1",
  business_id: "biz-1",
  status: "DRAFT",
  terac_opportunity_id: "opp-1",
  max_cost_usd: 20,
};
const capturedTools = liveTools.map((tool) => ToolSchema.parse(tool));
const createTool = capturedTools.find(
  (tool) => tool.name === "terac_create_opportunity",
)!;
function client() {
  return {
    tools: [createTool],
    call: vi.fn(async (name: string) => {
      if (name === "terac_get_opportunity")
        return {
          id: "opp-1",
          status: "draft",
          pricing: { total_cost_cents: 1800, currency: "usd" },
          funding: { affordable: true },
        };
      return { id: "opp-1", status: "active" };
    }),
  } as unknown as Terac & { call: ReturnType<typeof vi.fn> };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://sidewalk.test");
  vi.stubEnv("TERAC_PROJECT_ID", "project-1");
  vi.stubEnv("DOWNLOAD_SIGNING_SECRET", "unit-test-secret");
  vi.stubEnv("TERAC_MAX_TASK_COST_USD", "20");
  f.from.mockImplementation(() => ({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
    update: () => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: job.id }, error: null }),
          }),
        }),
      }),
    }),
  }));
  f.insert.mockResolvedValue({ id: "task-1" });
});
afterEach(() => vi.unstubAllEnvs());
describe("sales context and contract", () => {
  it("provides sourced phone, price, preview, exact checkout and fulfillment scope", () => {
    const context = salesBrief(brief, site, product, {
      classification: "NO_WEBSITE",
      defects: [],
    });
    expect(context).toMatchObject({
      phone: brief.contactPhone,
      phoneSource: brief.phoneSource,
      liveWebsite: site.preview_url,
      storefront: product.storefront_url,
      checkout: product.purchase_url,
      priceUsd: 199,
    });
    expect(context.offer).toContain("Hosting, domain registration");
    expect(context.instructions).toContain("not guaranteed a sale");
    expect(() =>
      salesBrief({ ...brief, contactPhone: null }, site, product, {}),
    ).toThrow("phone");
    expect(() =>
      salesBrief(brief, site, { ...product, verified: false }, {}),
    ).toThrow("validated");
  });
  it("includes the exact email and provider status for the caller to reference", () => {
    const email = {
      status: "SENT" as const,
      address: "owner@cafe.test",
      subject: "Website for Test Cafe",
      body: "Exact offer with preview and Whop links",
      providerMessageId: "mail-1",
      sentAt: "2026-10-24T14:00:00Z",
    };
    expect(salesBrief(brief, site, product, {}, email).salesEmail).toEqual(
      email,
    );
    expect(
      salesBrief(
        brief,
        site,
        product,
        {},
        { status: "EMAIL_FAILED", error: "timeout" },
      ).salesEmail.status,
    ).toBe("EMAIL_FAILED");
  });
  it("creates one screened sales assignment with a private task page and manual completion review", () => {
    const input = salesOpportunity(job);
    expect(input.num_participants).toBe(1);
    expect(input.tasks).toHaveLength(1);
    expect(input.tasks[0]).toMatchObject({
      review_type: "manual_review",
      task_type: "interview",
      duration_minutes: 20,
    });
    expect(input.tasks[0].task_url).toMatch(
      /^https:\/\/sidewalk.test\/sales\/task-1\?signature=[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(input)).not.toContain(brief.contactPhone);
    expect(input).not.toHaveProperty("candidate_profile");
    expect(input.description).toContain("experienced English-speaking");
    expect(input.expected_days_to_complete).toBe(5);
    expect(input.customer_screening_review).toBe("auto_invite");
    expect(input.filters).toEqual([
      { "multi_select--country": { $in: ["US"] } },
      { "multi_select--language": { $in: ["en-US"] } },
      { "integer--age": { $gte: 18 } },
    ]);
    expect(input).not.toHaveProperty("unrestricted_audience");
    expect(input.screening_questions[0].answers).toContainEqual({
      text: "No",
      qualify_logic: "reject",
    });
    expect(teracArguments(createTool, input)).toEqual(input);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() => salesOpportunity(job)).toThrow("public HTTPS");
  });
  it("rejects the obsolete profile field and one-day recruitment window against the live schema", () => {
    const input = salesOpportunity(job);
    expect(() =>
      teracArguments(createTool, {
        ...input,
        candidate_profile: "salesperson",
      }),
    ).toThrow("does not support candidate_profile");
    expect(() =>
      teracArguments(createTool, { ...input, expected_days_to_complete: 1 }),
    ).toThrow("contract");
    expect(() =>
      teracArguments(createTool, {
        ...input,
        tasks: [{ ...input.tasks[0], duration_minutes: 0 }],
      }),
    ).toThrow("contract");
  });
  it("validates lifecycle parameter normalization against the captured provider contracts", () => {
    for (const [name, values, expected] of [
      [
        "terac_get_opportunity",
        { opportunity_id: "opp-1" },
        { opportunityId: "opp-1" },
      ],
      [
        "terac_launch_draft_opportunity",
        { opportunity_id: "opp-1" },
        { opportunityId: "opp-1" },
      ],
      [
        "terac_get_submission",
        { submission_id: "sub-1" },
        { submissionId: "sub-1" },
      ],
      [
        "terac_approve_submission",
        { submission_id: "sub-1" },
        { submissionId: "sub-1" },
      ],
    ] as const) {
      const tool = capturedTools.find((t) => t.name === name)!;
      expect(teracArguments(tool, values)).toEqual(expected);
    }
  });
  it("rejects unsupported fields, missing required fields and invalid nested values", () => {
    const tool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: { type: "string" },
          tasks: {
            type: "array",
            items: { type: "object", required: ["task_url"] },
          },
        },
        required: ["opportunityId"],
      },
    } as Tool;
    expect(teracArguments(tool, { opportunity_id: "opp" })).toEqual({
      opportunityId: "opp",
    });
    expect(() => teracArguments(tool, { unsupported: true })).toThrow(
      "does not support",
    );
    expect(() => teracArguments(tool, {})).toThrow("contract");
    expect(() =>
      teracArguments(tool, { opportunity_id: "opp", tasks: [{}] }),
    ).toThrow("contract");
  });
  it("rejects provider errors and plain text instead of inventing success", () => {
    expect(teracResult({ structuredContent: { data: { id: "opp" } } })).toEqual(
      { id: "opp" },
    );
    expect(() => teracResult({ isError: true })).toThrow();
    expect(() =>
      teracResult({ content: [{ type: "text", text: "done" }] }),
    ).toThrow();
    expect(() =>
      teracResult({ structuredContent: { error: "failed" } }),
    ).toThrow();
  });
  it("requires a complete positive all-in USD quote", () => {
    expect(
      opportunityQuote({
        pricing: { total_cost_cents: 1800, currency: "usd" },
      }),
    ).toBe(18);
    for (const pricing of [
      {},
      { total_cost_cents: 1800, currency: "eur" },
      { total_cost_cents: -1, currency: "usd" },
    ])
      expect(() => opportunityQuote({ pricing })).toThrow();
  });
});
describe("durable recruitment", () => {
  it("creates the complete validated assignment before checking its quote and launching", async () => {
    const terac = client();
    await processSalesTask({ ...job, status: "QUEUED" }, terac);
    expect(terac.call.mock.calls.map(([name]) => name)).toEqual([
      "terac_create_opportunity",
      "terac_get_opportunity",
      "terac_launch_draft_opportunity",
    ]);
    const created = terac.call.mock.calls[0][1];
    expect(teracArguments(createTool, created)).toEqual(salesOpportunity(job));
    expect(created).not.toHaveProperty("candidate_profile");
    expect(created.tasks[0]).toMatchObject({
      task_type: "interview",
      review_type: "manual_review",
    });
  });
  it("refuses a quote above the reserved allowance before launch", async () => {
    const terac = client();
    await expect(
      processSalesTask({ ...job, max_cost_usd: 10 }, terac),
    ).rejects.toThrow("exceeds");
    expect(
      terac.call.mock.calls.some(
        ([name]) => name === "terac_launch_draft_opportunity",
      ),
    ).toBe(false);
  });
  it("refuses unfunded drafts", async () => {
    const terac = client();
    terac.call.mockResolvedValue({
      status: "draft",
      pricing: { total_cost_cents: 1800, currency: "usd" },
      funding: { affordable: false },
    });
    await expect(processSalesTask(job, terac)).rejects.toThrow("balance");
    expect(terac.call).toHaveBeenCalledTimes(1);
  });
  it("records recruiting only after launch and does not mark the business paid", async () => {
    const terac = client();
    await processSalesTask(job, terac);
    expect(terac.call).toHaveBeenCalledWith("terac_launch_draft_opportunity", {
      opportunity_id: "opp-1",
    });
    expect(f.update).toHaveBeenCalledWith(
      "sales_tasks",
      "task-1",
      expect.objectContaining({ status: "RECRUITING" }),
    );
    expect(
      f.update.mock.calls.every(([table]) => table === "sales_tasks"),
    ).toBe(true);
  });
  it.each(["CREATING", "LAUNCHING", "APPROVING"])(
    "never replays an interrupted %s operation",
    async (status) => {
      const terac = client();
      await processSalesTask({ ...job, status }, terac);
      expect(terac.call).not.toHaveBeenCalled();
      expect(f.update).toHaveBeenCalledWith(
        "sales_tasks",
        "task-1",
        expect.objectContaining({ status: "NEEDS_REVIEW" }),
      );
    },
  );
  it("does not launch a draft another worker has claimed", async () => {
    f.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });
    const terac = client();
    await processSalesTask(job, terac);
    expect(terac.call).toHaveBeenCalledTimes(1);
  });
  it("suppresses a do-not-call number without creating a task", async () => {
    f.from.mockReturnValue({
      select: () => ({
        eq: async () => ({ data: [{ phone: "12125550100" }], error: null }),
      }),
    });
    await queueSalesTask("run-1", "biz-1", brief, site, product, {});
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.event).toHaveBeenCalledWith(
      "run-1",
      "biz-1",
      "DO_NOT_CALL",
      expect.any(String),
    );
  });
  it("binds a report to its actual Terac opportunity", async () => {
    const terac = client();
    terac.call.mockResolvedValue({
      opportunity_id: "different",
      status: "in_progress",
    });
    await expect(
      verifySalesSubmission(terac, job, "submission-1"),
    ).rejects.toThrow("does not belong");
  });
  it("records accepted call work without overwriting a concurrent paid/delivered business", async () => {
    const terac = client();
    terac.call.mockResolvedValue({
      opportunity_id: "opp-1",
      status: "approved",
    });
    await processSalesTask(
      {
        ...job,
        status: "REPORTED",
        report: { submissionId: "submission-1", outcome: "PURCHASE_REPORTED" },
      },
      terac,
    );
    expect(f.update).toHaveBeenCalledWith("sales_tasks", "task-1", {
      status: "COMPLETED",
      error: null,
    });
    expect(
      f.update.mock.calls.every(([table]) => table === "sales_tasks"),
    ).toBe(true);
  });
});
it("validates substantive reports and rejects future calls", () => {
  const report = {
    submissionId: "sub-1",
    outcome: "NO_ANSWER",
    notes: "Called the public number; no answer.",
    calledAt: new Date().toISOString(),
  };
  expect(callReportSchema.safeParse(report).success).toBe(true);
  expect(callReportSchema.safeParse({ ...report, notes: "" }).success).toBe(
    false,
  );
  expect(
    callReportSchema.safeParse({ ...report, calledAt: "2099-01-01T00:00:00Z" })
      .success,
  ).toBe(false);
});
