import { expect, it, vi } from "vitest";
const { safeFetch, ordinaryFetch } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  ordinaryFetch: vi.fn(),
}));
vi.mock("undici", () => ({ Agent: class {}, fetch: safeFetch }));
vi.mock("../lib/network", () => ({
  publicAddress: vi.fn(),
  webUrl: (value: string) => new URL(value),
}));
import { request } from "../lib/http";
it("pairs the safe dispatcher with fetch from the same Undici package", async () => {
  const result = new Response("ok");
  safeFetch.mockResolvedValue(result);
  vi.stubGlobal("fetch", ordinaryFetch);
  try {
    expect(await request("https://example.com", {}, true)).toBe(result);
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ dispatcher: expect.any(Object) }),
    );
    expect(ordinaryFetch).not.toHaveBeenCalled();
    ordinaryFetch.mockResolvedValue(result);
    expect(await request("https://example.com")).toBe(result);
    expect(ordinaryFetch).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
