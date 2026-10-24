import { expect, it } from "vitest";
import { dashboardBusiness, summarize } from "../lib/dashboard";
import { latestAudit } from "../lib/map";

it("normalizes actual PostgREST unique relations for map and dashboard consumers", () => {
  const business = dashboardBusiness({
    id: "real-shaped-business",
    state: "WHOP_LISTED",
    audits: { classification: "POOR_WEBSITE", score: 32 },
    opportunities: { priority: 80 },
    sites: {
      qa_status: "PASSED",
      zip_path: "source.zip",
      products: { verified: true },
    },
    emails: { status: "SENT" },
    sales_tasks: null,
    events: [{ action: "AUDITED" }],
  });
  expect(latestAudit(business)?.score).toBe(32);
  expect(summarize([business], [], [])).toMatchObject({
    qualified: 1,
    built: 1,
  });
  expect(business.sites[0].products).toEqual([{ verified: true }]);
  expect(business.sales_tasks).toEqual([]);
  expect(dashboardBusiness(business)).toEqual(business);
});

it("normalizes a newly discovered business with no related records", () => {
  const business = dashboardBusiness({
    id: "new",
    audits: null,
    sites: null,
    opportunities: null,
    emails: null,
  });
  expect(latestAudit(business)).toBeUndefined();
  expect(summarize([business], [], [])).toMatchObject({
    qualified: 0,
    built: 0,
  });
});
