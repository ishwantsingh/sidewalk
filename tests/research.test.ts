import { expect, it } from "vitest";
import { phoneAppearsInSource } from "../lib/research";
it("retains phone numbers only when a real phone span appears in the cited text", () => {
  expect(
    phoneAppearsInSource(
      "+1 (212) 555-0100",
      "Call +1 (212) 555-0100 for hours.",
    ),
  ).toBe(true);
  expect(phoneAppearsInSource("212-555-0100", "Phone: (212) 555-0100")).toBe(
    true,
  );
  expect(
    phoneAppearsInSource(
      "2125550100",
      "Address 212 Main St. Price $555. ZIP 0100",
    ),
  ).toBe(false);
  expect(phoneAppearsInSource("2125550100", "Phone (212) 555-0199")).toBe(
    false,
  );
  expect(phoneAppearsInSource("212", "212")).toBe(false);
});
