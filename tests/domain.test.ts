import { describe, it, expect } from "vitest";
import {
  classify,
  leadPriority,
  safePath,
  slug,
  identityKey,
} from "../lib/domain";
import { runSchema } from "../lib/config";
describe("qualification rules", () => {
  const brief = {
    contactEmail: "cafe@example.com",
    contactSource: "https://example.com/contact",
    contactPhone: null,
    phoneSource: null,
  } as import("../lib/research").Brief;
  it("keeps a confirmed absent website score as N/A", () => {
    expect(classify(null, [], true)).toBe("NO_WEBSITE");
  });
  it("accepts a weak score or one measured defect", () => {
    expect(classify(74, [])).toBe("POOR_WEBSITE");
    expect(classify(90, ["Mobile overflow"])).toBe("POOR_WEBSITE");
    expect(classify(75, [])).toBe("GOOD_WEBSITE");
    expect(classify(null, ["unreachable"])).toBe("NEEDS_REVIEW");
  });
  it("always ranks reachable no-website businesses ahead of weak websites", () => {
    const noSite = leadPriority("NO_WEBSITE", null, brief);
    const poorSite = leadPriority("POOR_WEBSITE", 0, {
      ...brief,
      contactPhone: "212-555-0100",
      phoneSource: "https://example.com/contact",
    });
    expect(noSite).toBeGreaterThan(poorSite);
    expect(leadPriority("POOR_WEBSITE", 25, brief)).toBeGreaterThan(
      leadPriority("POOR_WEBSITE", 70, brief),
    );
  });
  it("never ranks a business with missing contact provenance or a good website", () => {
    expect(
      leadPriority("NO_WEBSITE", null, { ...brief, contactSource: null }),
    ).toBe(0);
    expect(leadPriority("GOOD_WEBSITE", 95, brief)).toBe(0);
  });
  it("rejects unsafe spending/build/sales limits", () => {
    const valid = {
      area: "Brooklyn",
      radiusMeters: 1300,
      types: ["cafe"],
      maxBusinesses: 20,
      maxSitesToBuild: 3,
      maxRealEmails: 3,
      maxSalesTasks: 3,
      maxLovableRepairAttempts: 2,
      maxEstimatedRunCostUsd: 25,
    };
    expect(runSchema.safeParse(valid).success).toBe(true);
    expect(runSchema.parse(valid).requireEmailAndPhone).toBe(false);
    expect(
      runSchema.parse({ ...valid, requireEmailAndPhone: true })
        .requireEmailAndPhone,
    ).toBe(true);
    for (const override of [
      { selectedBusinessId: "not-a-uuid" },
      {
        selectedBusinessId: "00000000-0000-4000-8000-000000000000",
        maxSitesToBuild: 2,
      },
      { maxSitesToBuild: 4 },
      { maxSalesTasks: 4 },
      { maxLovableRepairAttempts: 3 },
      { radiusMeters: 50001 },
      { maxEstimatedRunCostUsd: -1 },
      { requireEmailAndPhone: "true" },
      { requireEmailAndPhone: true, maxRealEmails: 0 },
      { requireEmailAndPhone: true, maxSalesTasks: 0 },
    ])
      expect(runSchema.safeParse({ ...valid, ...override }).success).toBe(
        false,
      );
  });
});
describe("source export boundaries", () => {
  it.each([
    "../escape",
    "/etc/passwd",
    "src/../../secret",
    "src\\escape",
    ".env",
    ".env.local",
    "src/.env.production",
    ".git/config",
    "node_modules/x.js",
    "private.key",
    "src//index.ts",
  ])("rejects %s", (path) => expect(() => safePath(path)).toThrow());
  it("preserves valid relative source paths", () => {
    expect(safePath("src/components/Menu.tsx")).toBe("src/components/Menu.tsx");
    expect(slug("Maple Street Café!")).toBe("maple-street-cafe");
  });
});

it("normalizes independent business identities without merging different locations", () => {
  expect(
    identityKey("Maple Café", "123 Main St.", "https://www.example.com/"),
  ).toBe(identityKey("MAPLE CAFE", "123 Main St", "http://example.com/menu"));
  expect(identityKey("Maple Cafe", "124 Main St", null)).not.toBe(
    identityKey("Maple Cafe", "123 Main St", null),
  );
});
