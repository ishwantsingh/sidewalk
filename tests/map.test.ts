import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_AREA,
  latestAudit,
  websiteStatus,
  websiteStatuses,
} from "../lib/map";

describe("business map", () => {
  it("fixes the map to Williamsburg", () => {
    expect(DEFAULT_AREA).toBe("Williamsburg, Brooklyn");
  });
  it("uses audit evidence and keeps unknown or unaudited businesses gray", () => {
    expect(
      websiteStatus({ website_url: "https://example.com", audits: [] }),
    ).toBe("NEEDS_REVIEW");
    expect(websiteStatus({ audits: [{ classification: "PENDING" }] })).toBe(
      "NEEDS_REVIEW",
    );
    for (const classification of ["GOOD_WEBSITE", "POOR_WEBSITE", "NO_WEBSITE"])
      expect(websiteStatus({ audits: [{ classification }] })).toBe(
        classification,
      );
    expect(websiteStatuses.GOOD_WEBSITE.color).toBe("#27865c");
    expect(websiteStatuses.POOR_WEBSITE.color).toBe("#d69e17");
    expect(websiteStatuses.NO_WEBSITE.color).toBe("#d34d48");
  });
  it("chooses the latest audit without mutating persisted order", () => {
    const audits = [
      { classification: "GOOD_WEBSITE", created_at: "2026-10-21" },
      { classification: "POOR_WEBSITE", created_at: "2026-10-24" },
    ];
    expect(websiteStatus({ audits })).toBe("POOR_WEBSITE");
    expect(latestAudit({ audits })).toBe(audits[1]);
    expect(audits[0].classification).toBe("GOOD_WEBSITE");
  });
});

describe("Google Maps script loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });
  it("loads once with the supplied browser key and resolves on Google's callback", async () => {
    const script = { src: "", async: false, onerror: null, remove: vi.fn() };
    const host: Record<string, any> = {};
    const append = vi.fn();
    vi.stubGlobal("window", host);
    vi.stubGlobal("document", {
      createElement: () => script,
      head: { append },
    });
    const { loadGoogleMaps } = await import("../lib/google-maps");
    const first = loadGoogleMaps("browser-key");
    expect(loadGoogleMaps("browser-key")).toBe(first);
    expect(append).toHaveBeenCalledTimes(1);
    const url = new URL(script.src);
    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.searchParams.get("key")).toBe("browser-key");
    expect(url.searchParams.get("libraries")).toBe("marker");
    host.google = { maps: { marker: {} } };
    host.sidewalkMapReady();
    await expect(first).resolves.toBe(host.google.maps);
  });
  it("reports authentication errors even after the script has loaded", async () => {
    const host: Record<string, any> = {};
    vi.stubGlobal("window", host);
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { append: vi.fn() },
    });
    const { loadGoogleMaps, onGoogleMapsError } =
      await import("../lib/google-maps");
    const error = vi.fn();
    const unsubscribe = onGoogleMapsError(error);
    const loaded = loadGoogleMaps("bad-key");
    host.google = { maps: { marker: {} } };
    host.sidewalkMapReady();
    await loaded;
    host.gm_authFailure();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("rejected the browser key"),
    );
    unsubscribe();
  });
  it("times out instead of leaving a permanently loading map", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { append: vi.fn() },
    });
    const { loadGoogleMaps } = await import("../lib/google-maps");
    const assertion = expect(loadGoogleMaps("browser-key")).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });
  it("surfaces a failed download and allows another attempt", async () => {
    const scripts: {
      src?: string;
      onerror?: () => void;
      remove: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => {
        const s = { remove: vi.fn() };
        scripts.push(s);
        return s;
      },
      head: { append: vi.fn() },
    });
    const { loadGoogleMaps } = await import("../lib/google-maps");
    const first = loadGoogleMaps("browser-key");
    const assertion = expect(first).rejects.toThrow("could not load");
    scripts[0].onerror!();
    await assertion;
    expect(scripts[0].remove).toHaveBeenCalled();
    const second = loadGoogleMaps("browser-key");
    const secondAssertion = expect(second).rejects.toThrow("could not load");
    scripts[1].onerror!();
    await secondAssertion;
  });
});
