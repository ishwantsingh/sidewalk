import { describe, expect, it, vi } from "vitest";
import { verifyDeployment } from "../scripts/verify-deployment";

function deployment(overrides: Record<string, Response> = {}) {
  const bodies: Record<string, unknown> = {
    "/api/config": { missing: [] },
    "/api/runs": [],
    "/api/businesses": [],
    "/api/overview": { orders: [], events: [] },
  };
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    if (overrides[path]) return overrides[path];
    if (path === "/")
      return new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html" },
      });
    return Response.json(bodies[path], {
      headers: { "cache-control": "no-store" },
    });
  });
}

describe("deployed UI/API smoke check", () => {
  it("accepts empty persisted data and only reads the public production origin", async () => {
    const request = deployment();
    await expect(
      verifyDeployment("https://sidewalk.netlify.app", request),
    ).resolves.toContain("PASS");
    expect(request).toHaveBeenCalledTimes(5);
    for (const [input, options] of request.mock.calls) {
      expect(new URL(String(input)).origin).toBe(
        "https://sidewalk.netlify.app",
      );
      expect(options?.method ?? "GET").toBe("GET");
      expect(options?.redirect).toBe("error");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.headers).toBeUndefined();
    }
  });

  it("reports incomplete configuration even when dashboard reads work", async () => {
    const request = deployment({
      "/api/config": Response.json(
        { missing: ["WHOP_WEBHOOK_SECRET"] },
        {
          headers: { "cache-control": "no-store" },
        },
      ),
    });
    await expect(
      verifyDeployment("https://sidewalk.netlify.app", request),
    ).rejects.toThrow("Deployment reachable; configure: WHOP_WEBHOOK_SECRET");
  });

  it("fails for provider/database errors without including their bodies", async () => {
    const request = deployment({
      "/api/runs": Response.json(
        { error: "secret-provider-detail" },
        { status: 500 },
      ),
    });
    await expect(
      verifyDeployment("https://sidewalk.netlify.app", request),
    ).rejects.toThrow(/^\/api\/runs: HTTP 500$/);
  });

  it("rejects login/SPA HTML served in place of an API and cached API responses", async () => {
    for (const response of [
      new Response("<html>Login</html>", {
        headers: { "content-type": "text/html" },
      }),
      Response.json([]),
    ]) {
      await expect(
        verifyDeployment(
          "https://sidewalk.netlify.app",
          deployment({ "/api/runs": response }),
        ),
      ).rejects.toThrow();
    }
  });

  it("rejects successful-looking API data with the wrong shape", async () => {
    await expect(
      verifyDeployment(
        "https://sidewalk.netlify.app",
        deployment({
          "/api/businesses": Response.json(
            { businesses: [] },
            {
              headers: { "cache-control": "no-store" },
            },
          ),
        }),
      ),
    ).rejects.toThrow();
  });

  it("requires an HTTPS origin before making any request", async () => {
    const request = deployment();
    for (const origin of [
      "http://localhost:3000",
      "https://user:secret@example.com",
      "https://example.com/path",
      "https://example.com?token=secret",
      "https://example.com#fragment",
    ])
      await expect(verifyDeployment(origin, request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
