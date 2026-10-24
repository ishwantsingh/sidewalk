import { expect, it } from "vitest";
import { hasPrice, productPageUrl } from "../lib/commerce";
it("uses the unique product route inside the seller storefront", () => {
  expect(productPageUrl("sidewalk-ai", "maple-cafe-website")).toBe(
    "https://whop.com/sidewalk-ai/maple-cafe-website/",
  );
  expect(() => productPageUrl("../escape", "cafe")).toThrow();
});
it("checks the actual visible price without a regex currency-escaping error", () => {
  expect(hasPrice("Website $199 Buy now", 199)).toBe(true);
  expect(hasPrice("$199.00", 199)).toBe(true);
  expect(hasPrice("$1,299.50", 1299.5)).toBe(true);
  expect(hasPrice("199 reviews $299", 199)).toBe(false);
  expect(hasPrice("$1990", 199)).toBe(false);
});
