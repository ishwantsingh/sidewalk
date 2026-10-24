import { expect, it, vi } from "vitest";

// Serverless API startup must work without worker-only browser dependencies.
vi.mock("playwright", () => {
  throw new Error("Playwright must not be loaded by the web API");
});
vi.mock("lighthouse", () => {
  throw new Error("Lighthouse must not be loaded by the web API");
});

import { GET } from "../app/api/[...path]/route";

it("serves configuration with browser automation unavailable", async () => {
  const response = await GET(
    new Request("https://sidewalkai.netlify.app/api/config"),
    { params: Promise.resolve({ path: ["config"] }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    missing: expect.any(Array),
    issues: expect.any(Array),
  });
});
