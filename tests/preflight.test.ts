import { describe, expect, it } from "vitest";
import { safeError } from "../lib/preflight";

describe("preflight diagnostics", () => {
  it("handles Whop SDK statusCode and identifies the required account scope", () => {
    expect(
      safeError({
        statusCode: 403,
        body: {
          error: {
            message:
              "Business account API key is not authorized for the company:balance:read scope.",
          },
        },
      }),
    ).toContain("company:balance:read");
    expect(safeError({ statusCode: 401, message: "secret" })).toBe(
      "Provider HTTP 401",
    );
  });
  it("never emits arbitrary provider messages or request URLs", () => {
    const message = "secret=provider-token https://example.com?key=private";
    expect(safeError(new Error(message))).not.toMatch(
      /provider-token|private|https:/,
    );
    expect(safeError({ status: 403, message })).toBe("Provider HTTP 403");
  });
  it("keeps actionable fixed setup errors", () => {
    for (const message of [
      "Places API (New) disabled",
      "Schema unavailable: sales_tasks, sales_suppressions",
      "Resend key is send-only; full access required for domain verification",
    ])
      expect(safeError(new Error(message))).toBe(message);
  });
});
