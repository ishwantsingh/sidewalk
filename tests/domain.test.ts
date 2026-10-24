import { describe, it, expect } from "vitest";
import {
  classify,
  economics,
  safePath,
  slug,
  identityKey,
} from "../lib/domain";
import { runSchema } from "../lib/config";
describe("qualification rules", () => {
  it("keeps a confirmed absent website score as N/A", () => {
    expect(classify(null, [], true)).toBe("NO_WEBSITE");
    expect(
      economics(null, "NO_WEBSITE", true, 1, 199, 5, 0.2, 3, 0.3)
        .website_opportunity,
    ).toBe(100);
  });
  it("requires two measured defects for poor websites", () => {
    expect(classify(44, ["one"])).toBe("NEEDS_REVIEW");
    expect(classify(44, ["one", "two"])).toBe("POOR_WEBSITE");
    expect(classify(45, ["one", "two"])).toBe("GOOD_WEBSITE");
    expect(classify(null, ["unreachable"])).toBe("NEEDS_REVIEW");
  });
  it("does not prioritize businesses without a sourced contact", () => {
    expect(
      economics(null, "NO_WEBSITE", false, 1, 199, 5, 0.2, 3, 0.3).priority,
    ).toBe(0);
  });
  it("calculates expected contribution after fees and costs", () => {
    const e = economics(null, "NO_WEBSITE", true, 1, 199, 5, 0.2, 3, 0.3);
    expect(e.purchase_probability).toBeCloseTo(0.25);
    expect(e.expected_contribution).toBeCloseTo(
      0.25 * (199 - 5.97 - 0.3) - 5 - 0.2,
    );
  });
  it("rejects unsafe spending/build/send limits", () => {
    const valid = {
      area: "Brooklyn",
      radiusMeters: 1300,
      types: ["cafe"],
      maxBusinesses: 20,
      maxSitesToBuild: 3,
      maxRealEmails: 3,
      maxLovableRepairAttempts: 2,
      maxEstimatedRunCostUsd: 25,
    };
    expect(runSchema.safeParse(valid).success).toBe(true);
    for (const override of [
      { maxSitesToBuild: 4 },
      { maxRealEmails: 4 },
      { maxLovableRepairAttempts: 3 },
      { radiusMeters: 50001 },
      { maxEstimatedRunCostUsd: -1 },
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
