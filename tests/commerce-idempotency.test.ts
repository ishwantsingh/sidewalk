import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  rows: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  client: {
    files: {
      create: vi.fn(async () => ({
        id: "file_1",
        upload_url: "https://up.example",
      })),
      retrieve: vi.fn(async () => ({ upload_status: "ready" })),
    },
    products: {
      create: vi.fn(async () => ({
        id: "prod_1",
        route: "cafe-website-site1234",
      })),
      update: vi.fn(async () => ({
        id: "prod_1",
        route: "cafe-website-site1234",
      })),
      retrieve: vi.fn(async () => ({
        id: "prod_1",
        metadata: { siteId: "site1234-0000" },
        gallery_images: [],
      })),
    },
    variants: {
      create: vi.fn(async () => ({
        id: "plan_1",
        purchase_url: "https://whop.com/checkout/plan_1",
      })),
      list: vi.fn(async () => [
        {
          id: "plan_existing",
          purchase_url: "https://whop.com/checkout/plan_existing",
          metadata: { siteId: "site1234-0000" },
        },
      ]),
    },
    accounts: { retrieve: vi.fn(async () => ({ route: "sidewalk-ai" })) },
  },
}));
vi.mock("../lib/whop", () => ({ whop: () => f.client }));
vi.mock("../lib/http", () => ({
  request: vi.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(1),
  })),
}));
vi.mock("../lib/db", () => ({
  rows: f.rows,
  insert: vi.fn(async () => ({ id: "product-row" })),
  update: vi.fn(async () => ({})),
}));
vi.mock("../lib/config", () => ({ env: () => "acct_1" }));

const site = {
  id: "site1234-0000",
  business_id: "lead",
  screenshot_url: "https://assets.example/qa.png",
  preview_url: "https://cafe.lovable.app",
};
const firstArg = (fn: { mock: { calls: unknown[][] } }, index = 0) =>
  fn.mock.calls[0]?.[index];
beforeEach(() => vi.clearAllMocks());

it("never submits the concept listing to marketplace review", async () => {
  const { listProduct } = await import("../lib/commerce");
  await expect(listProduct(site, "Cafe", 199)).rejects.toThrow(
    "screenshot missing",
  );
  expect(f.client.products).not.toHaveProperty("publish");
  expect(firstArg(f.client.products.create)).toMatchObject({
    visibility: "visible",
  });
});

it("gives each Whop create request its own idempotency key", async () => {
  const { listProduct } = await import("../lib/commerce");
  // Stops at the gallery check, before browser verification.
  await expect(listProduct(site, "Cafe", 199)).rejects.toThrow(
    "screenshot missing",
  );
  expect(
    [f.client.files.create, f.client.products.create, f.client.variants.create]
      .map((create) => firstArg(create, 1))
      .map((options) => (options as { idempotencyKey: string }).idempotencyKey),
  ).toEqual([
    expect.stringMatching(/^whop-file-site1234-0000-[a-f0-9]{16}$/),
    expect.stringMatching(/^whop-product-site1234-0000-[a-f0-9]{16}$/),
    expect.stringMatching(/^whop-plan-site1234-0000-[a-f0-9]{16}$/),
  ]);
  expect(firstArg(f.client.products.create)).toMatchObject({
    headline: "Unofficial website concept for Cafe",
  });
});

it("completes a recorded unpublished listing instead of creating another", async () => {
  f.rows.mockResolvedValueOnce([
    { id: "product-row", whop_product_id: "prod_1", verified: false },
  ]);
  const { listProduct } = await import("../lib/commerce");
  await expect(listProduct(site, "Cafe", 199)).rejects.toThrow(
    "screenshot missing",
  );
  expect(f.client.products.create).not.toHaveBeenCalled();
  expect(f.client.files.create).not.toHaveBeenCalled();
  expect(f.client.variants.create).not.toHaveBeenCalled();
  expect(f.client.products.update).toHaveBeenCalledWith({
    id: "prod_1",
    headline: "Unofficial website concept for Cafe",
  });
});

it("refuses to adopt a recorded product that belongs to another site", async () => {
  f.rows.mockResolvedValueOnce([
    { id: "product-row", whop_product_id: "prod_1", verified: false },
  ]);
  f.client.products.retrieve.mockResolvedValueOnce({
    id: "prod_1",
    metadata: { siteId: "other" },
    gallery_images: [],
  });
  const { listProduct } = await import("../lib/commerce");
  await expect(listProduct(site, "Cafe", 199)).rejects.toThrow("another site");
  expect(f.client.products.update).not.toHaveBeenCalled();
});
