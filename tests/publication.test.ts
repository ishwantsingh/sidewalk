import { afterEach, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/http", () => ({ request }));
import { waitForPublication } from "../lib/publication";
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("waits through unavailable and startup responses without asking for a generation repair", async () => {
  vi.useFakeTimers();
  request
    .mockRejectedValueOnce(new Error("Provider HTTP 404"))
    .mockResolvedValueOnce(new Response("Publishing…"))
    .mockResolvedValueOnce(
      new Response(
        "Flower Cat — Unofficial concept, not affiliated with this business",
      ),
    );
  const waiting = waitForPublication("https://site.lovable.app", "Flower Cat");
  await vi.advanceTimersByTimeAsync(10000);
  await expect(waiting).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledTimes(3);
});
it("stops at a login wall instead of treating it as an app defect", async () => {
  const response = new Response("Log in");
  Object.defineProperty(response, "url", {
    value: "https://lovable.dev/login",
  });
  request.mockResolvedValue(response);
  await expect(
    waitForPublication("https://site.lovable.app", "Flower Cat"),
  ).rejects.toThrow("requires Lovable login");
  expect(request).toHaveBeenCalledOnce();
});
it("bounds waiting when the public site never becomes ready", async () => {
  vi.useFakeTimers();
  request.mockResolvedValue(new Response("Starting"));
  const waiting = waitForPublication(
    "https://site.lovable.app",
    "Flower Cat",
    10000,
  );
  const assertion = expect(waiting).rejects.toThrow("readiness timed out");
  await vi.advanceTimersByTimeAsync(10000);
  await assertion;
});
