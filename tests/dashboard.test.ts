import { describe, it, expect } from "vitest";
import { summarize, dailyTotals } from "../lib/dashboard";

describe("dashboard reporting", () => {
  it("excludes internal payments and groups numeric strings into UTC days with zero-filled gaps", () => {
    const orders = [
      {
        amount: "199",
        internal: false,
        paid_at: "2026-10-24T01:00:00Z",
        delivery_state: "DELIVERED",
      },
      { amount: 999, internal: true, paid_at: "2026-10-24T01:00:00Z" },
      { amount: 100, internal: false, paid_at: "2026-10-17T23:59:59Z" },
    ];
    const events = [{ cost_usd: "3.50", created_at: "2026-10-24T20:00:00Z" }];
    const days = dailyTotals(orders, events, "2026-10-24T23:00:00Z");
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({
      day: "2026-10-18",
      revenue: 0,
      spending: 0,
    });
    expect(days[6]).toMatchObject({
      day: "2026-10-24",
      revenue: 199,
      spending: 3.5,
    });
    expect(summarize([], orders, events)).toMatchObject({
      revenue: 299,
      spending: 3.5,
      delivered: 1,
    });
  });
  it("does not count rejected prospects, unexported builds, unverified products, or unlaunched sales tasks", () => {
    const result = summarize(
      [
        {
          state: "REJECTED",
          opportunities: [{ priority: 100 }],
          sites: [{ qa_status: "PASSED", products: [{ verified: false }] }],
          sales_tasks: [{ status: "NEEDS_REVIEW" }],
        },
      ],
      [],
      [],
    );
    expect(result.pipeline.map((s) => s.value)).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(summarize([], [], []).revenue).toBe(0);
  });
});
