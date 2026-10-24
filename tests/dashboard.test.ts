import { describe, it, expect } from "vitest";
import demo from "../data/dashboard-demo.json";
import { summarize, dailyTotals } from "../lib/dashboard";

describe("dashboard reporting", () => {
  it("reports the demo from the same records used by the table", () => {
    const summary = summarize(
      demo.businesses,
      demo.overview.orders,
      demo.overview.events,
    );
    expect(summary).toMatchObject({
      revenue: 698,
      qualified: 10,
      built: 6,
      delivered: 2,
    });
    expect(summary.pipeline.map((s) => s.value)).toEqual([12, 10, 6, 5, 4, 2]);
    expect(
      dailyTotals(demo.overview.orders, demo.overview.events, demo.asOf).reduce(
        (s, d) => s + d.revenue,
        0,
      ),
    ).toBe(summary.revenue);
  });
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
  it("does not count rejected prospects, unexported builds, unverified products, or failed emails", () => {
    const result = summarize(
      [
        {
          state: "REJECTED",
          opportunities: [{ priority: 100 }],
          sites: [{ qa_status: "PASSED", products: [{ verified: false }] }],
          emails: [{ status: "FAILED" }],
        },
      ],
      [],
      [],
    );
    expect(result.pipeline.map((s) => s.value)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(summarize([], [], []).revenue).toBe(0);
  });
  it("keeps demo orders linked to real fixture businesses and products", () => {
    for (const order of demo.overview.orders) {
      expect(
        demo.businesses.some((b) =>
          b.sites.some((s) =>
            s.products.some((p) => p.id === order.product_id),
          ),
        ),
      ).toBe(true);
    }
    for (const b of demo.businesses)
      expect(demo.runs.some((r) => r.id === b.run_id)).toBe(true);
  });
});
