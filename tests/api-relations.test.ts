import { expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../lib/db", async (original) => ({
  ...(await original<typeof import("../lib/db")>()),
  db: () => ({
    from: () => ({ select: () => ({ order: () => ({ limit: query }) }) }),
  }),
}));
import { GET } from "../app/api/[...path]/route";
import { latestAudit } from "../lib/map";
import { summarize } from "../lib/dashboard";

it("serves usable list relations when PostgREST returns unique objects and nulls", async () => {
  query.mockResolvedValue({
    data: [
      {
        id: "business",
        run_id: "run",
        state: "QUALIFIED",
        audits: { score: 30, classification: "POOR_WEBSITE" },
        opportunities: { priority: 80 },
        sites: null,
        emails: null,
        sales_tasks: null,
        events: [],
      },
    ],
    error: null,
  });
  const response = await GET(
    new Request("https://sidewalkai.netlify.app/api/businesses?run=run"),
    { params: Promise.resolve({ path: ["businesses"] }) },
  );
  expect(response.status).toBe(200);
  const businesses = await response.json();
  expect(latestAudit(businesses[0])?.score).toBe(30);
  expect(summarize(businesses, [], [])).toMatchObject({
    qualified: 1,
    built: 0,
  });
  expect(businesses[0].sites).toEqual([]);
});
