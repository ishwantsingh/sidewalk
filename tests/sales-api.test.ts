import { beforeEach, afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  one: vi.fn(),
  from: vi.fn(),
  call: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  one: f.one,
  db: () => ({ from: f.from }),
  update: f.update,
}));
vi.mock("../lib/terac", () => ({
  Terac: class {
    async connect() {}
    async close() {}
    call = f.call;
  },
}));
import { GET, POST } from "../app/api/[...path]/route";
import { salesSignature } from "../lib/sales-access";
const id = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ path: ["sales", id] }) };
const report = () => ({
  submissionId: "sub-1",
  outcome: "NO_ANSWER",
  notes: "Called the business phone; nobody answered.",
  calledAt: new Date().toISOString(),
});
const url = () =>
  `https://sidewalk.test/api/sales/${id}?signature=${salesSignature(id)}`;
const post = (body: unknown) =>
  new Request(url(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://sidewalk.test",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://sidewalk.test");
  vi.stubEnv("DOWNLOAD_SIGNING_SECRET", "test-key");
  f.one.mockResolvedValue({
    id,
    status: "RECRUITING",
    terac_opportunity_id: "opp-1",
    brief: { phone: "+1 212 555 0100" },
    created_at: new Date(Date.now() - 60000).toISOString(),
  });
  f.call.mockResolvedValue({ opportunity_id: "opp-1", status: "in_progress" });
  f.upsert.mockResolvedValue({ error: null });
  f.from.mockImplementation(() => ({
    upsert: f.upsert,
    update: (values: unknown) => {
      f.update(values);
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id }, error: null }),
            }),
          }),
        }),
      };
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());
it("denies unsigned brief access before touching the database", async () => {
  expect(
    (await GET(new Request(`https://sidewalk.test/api/sales/${id}`), ctx))
      .status,
  ).toBe(403);
  expect(f.one).not.toHaveBeenCalled();
});
it("serves only the signed brief fields, not budget or provider credentials", async () => {
  const response = await GET(new Request(url()), ctx);
  expect(response.status).toBe(200);
  expect(Object.keys(await response.json())).toEqual(["id", "brief", "status"]);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("records a matched report without marking a payment or sending email", async () => {
  const response = await POST(post(report()), ctx);
  expect(response.status).toBe(200);
  expect(f.call).toHaveBeenCalledWith("terac_get_submission", {
    submission_id: "sub-1",
  });
  expect(f.update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "REPORTED",
      report: expect.objectContaining({ outcome: "NO_ANSWER" }),
    }),
  );
  expect(f.from.mock.calls.every(([table]) => table === "sales_tasks")).toBe(
    true,
  );
});
it("persists do-not-call suppression", async () => {
  expect(
    (await POST(post({ ...report(), outcome: "DO_NOT_CALL" }), ctx)).status,
  ).toBe(200);
  expect(f.upsert).toHaveBeenCalledWith({ phone: "12125550100" });
});
it("rejects empty reports, stale call times and replayed reports", async () => {
  expect((await POST(post({ ...report(), notes: "" }), ctx)).status).toBe(400);
  expect(
    (await POST(post({ ...report(), calledAt: "2020-01-01T00:00:00Z" }), ctx))
      .status,
  ).toBe(400);
  f.one.mockResolvedValue({ status: "REPORTED" });
  expect((await POST(post(report()), ctx)).status).toBe(409);
  expect(f.call).not.toHaveBeenCalled();
});
it("rejects another opportunity's submission before saving a report", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    f.call.mockResolvedValue({ opportunity_id: "wrong" });
    expect((await POST(post(report()), ctx)).status).toBe(403);
    expect(f.update).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
it("retains signed email opt-out links", async () => {
  expect(
    (
      await GET(new Request(`https://sidewalk.test/api/opt-out/${id}`), {
        params: Promise.resolve({ path: ["opt-out", id] }),
      })
    ).status,
  ).toBe(403);
});
