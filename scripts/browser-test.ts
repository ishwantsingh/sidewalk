import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const port = 3187,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    String(port),
    "-H",
    "127.0.0.1",
  ],
  {
    env: {
      ...process.env,
      APP_URL: origin,
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: "pipe",
  },
);
let startup = "";
server.stderr.on("data", (chunk) => {
  startup += chunk.toString();
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(startup);
    try {
      const r = await fetch(origin);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "App did not start");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.goto(origin);
  await page.getByRole("link", { name: "sidewalk", exact: true }).waitFor();
  // A complete configuration must show only API records, including a genuinely empty database.
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { missing: [] } }),
  );
  await page.route("**/api/runs", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/businesses", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/overview", (route) =>
    route.fulfill({ json: { orders: [], events: [] } }),
  );
  await page.reload();
  await page.getByText("No businesses yet. Create a run to begin.").waitFor();
  assert.equal(await page.getByText("Demo data", { exact: true }).count(), 0);
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.getByRole("button", { name: "New run" }).click();
  assert(
    !(await page
      .getByRole("button", { name: "Start run", exact: true })
      .isDisabled()),
  );
  assert.equal(
    await page.locator('[name="maxSitesToBuild"]').inputValue(),
    "1",
  );
  assert.equal(
    await page.locator('[name="maxEstimatedRunCostUsd"]').inputValue(),
    "75",
  );
  assert.equal(
    await page.locator('[name="requireEmailAndPhone"]').isChecked(),
    false,
  );
  await page.keyboard.press("Escape");
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      assert.equal(body.area, "Williamsburg, Brooklyn");
      assert.equal(body.maxSalesTasks, 1);
      assert.equal(body.maxRealEmails, 1);
      if (body.selectedBusinessId) {
        assert.equal(body.selectedBusinessId, "live-business");
        assert.equal(body.maxSitesToBuild, 1);
        assert.equal(body.maxBusinesses, 1);
        assert.deepEqual(body.types, ["cafe"]);
      }
      assert.equal(body.requireEmailAndPhone, !body.selectedBusinessId);
      await route.fulfill({
        status: 201,
        json: { id: "live-run", params: body },
      });
    } else
      await route.fulfill({
        json: [
          {
            id: "live-run",
            params: { area: "Brooklyn", types: ["cafe"] },
            created_at: "2026-10-24T14:00:00Z",
          },
        ],
      });
  });
  const liveBusiness = {
    id: "live-business",
    run_id: "live-run",
    name: "Live business",
    category: "Cafe",
    state: "DISCOVERED",
    audits: [
      {
        classification: "GOOD_WEBSITE",
        score: 51,
        defects: ["Overflow", "Metadata"],
      },
    ],
    opportunities: [],
    sites: [],
    products: [],
    sales_tasks: [],
    orders: [],
    events: [],
  };
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [liveBusiness] }),
  );
  await page.route("**/api/businesses/live-business", (route) =>
    route.fulfill({ json: liveBusiness }),
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Live business", exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.equal(
    await page
      .locator(
        ".map-inspector-empty > span, .map-inspector-empty > h3, .map-inspector-empty > p",
      )
      .count(),
    0,
  );
  assert.equal(
    await page.getByText("Sunday Coffee", { exact: true }).count(),
    0,
  );
  await page.getByRole("link", { name: "Live business", exact: true }).click();
  await page.getByRole("region", { name: "Live business" }).waitFor();
  assert.equal(await page.locator(".bw-summary").count(), 0);
  assert.equal(await page.locator(".bw-heading, .bw-eyebrow").count(), 0);
  await page
    .locator(".business-topbar h1")
    .filter({ hasText: "Live business" })
    .waitFor();
  assert.equal(await page.locator(".bw-tabs .bw-stage").count(), 1);
  await page.getByRole("heading", { name: "Links & resources" }).waitFor();
  await page.getByRole("button", { name: "Outreach", exact: true }).click();
  await page.getByText("No sales emails yet.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Activity/ }).click();
  await page.getByRole("heading", { name: "Business activity" }).waitFor();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: "Website overview" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/businesses/live-business");
  await page.getByRole("link", { name: "All businesses" }).click();

  await page.getByRole("button", { name: "New run" }).click();
  assert(
    (await page
      .getByRole("textbox", { name: "Neighborhood or city" })
      .getAttribute("readonly")) !== null,
  );
  await page
    .getByRole("checkbox", {
      name: "Require both a sourced email and phone before building",
    })
    .check();
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(
    await page.getByRole("combobox", { name: "Filter by run" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Map neighborhood" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("columnheader", { name: "Expected value" }).count(),
    0,
  );
  // Incomplete sales setup still displays actual database records.
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { missing: ["OPENAI_API_KEY"] } }),
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Live business", exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "New run" }).click();
  assert(
    await page
      .getByRole("button", { name: "Start run", exact: true })
      .isDisabled(),
  );
  await page.keyboard.press("Escape");
  // Fetch failures must remain visible rather than silently looking like sample data.
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: 500, json: { error: "Connection unavailable" } }),
  );
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Connection unavailable" })
    .waitFor();
  assert.equal(await page.getByText("Demo data", { exact: true }).count(), 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal((await page.request.get(`${origin}/api/config`)).status(), 200);
  assert.equal(
    (await page.request.post(`${origin}/api/session`)).status(),
    404,
  );
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Sign out" }).count(), 0);
  // The salesperson sees the actual handoff and can report a call on desktop/mobile.
  const salesBrief = {
    id: "sales-test",
    status: "RECRUITING",
    report: null,
    brief: {
      business: "Test Cafe",
      category: "cafe",
      phone: "+1 212 555 0100",
      phoneSource: "https://example.com/contact",
      liveWebsite: "https://preview.example.com",
      storefront: "https://whop.com/shop/cafe",
      checkout: "https://whop.com/checkout/plan_test",
      priceUsd: 199,
      salesEmail: {
        status: "SENT",
        address: "owner@example.com",
        subject: "We made a website concept for Test Cafe",
        body: "Here are your preview and Whop links.",
        sentAt: "2026-10-24T14:00:00Z",
      },
      offer:
        "One-time website source ZIP. Automatic delivery after Whop payment.",
      instructions:
        "Make one call during business hours and report the result.",
      facts: [
        {
          label: "Address",
          value: "123 Test Street",
          source: "https://example.com/contact",
        },
      ],
      websiteFindings: { classification: "NO_WEBSITE", defects: [] },
    },
  };
  await page.route("**/api/sales/**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      assert.equal(body.submissionId, "sub-test");
      assert.equal(body.outcome, "NO_ANSWER");
      assert.equal(body.notes, "Called the public phone; no answer.");
      await route.fulfill({ json: { recorded: true } });
    } else await route.fulfill({ json: salesBrief });
  });
  await page.goto(
    `${origin}/sales/sales-test?signature=test&submissionId=sub-test`,
  );
  await page
    .getByRole("heading", { name: "Sales assignment", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "View the completed website" })
      .getAttribute("href"),
    salesBrief.brief.liveWebsite,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Whop product page" })
      .getAttribute("href"),
    salesBrief.brief.storefront,
  );
  assert.equal(
    await page
      .getByRole("textbox", { name: "Terac submission ID" })
      .inputValue(),
    "sub-test",
  );
  await page
    .getByText("We made a website concept for Test Cafe", { exact: false })
    .waitFor();
  await page.screenshot({
    path: "artifacts/sales-brief-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Sales brief overflows mobile",
  );
  await page
    .getByRole("combobox", { name: "Outcome" })
    .selectOption("NO_ANSWER");
  await page
    .getByRole("textbox", { name: "Call notes" })
    .fill("Called the public phone; no answer.");
  await page.screenshot({
    path: "artifacts/sales-brief-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Submit call report" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Call report recorded" })
    .waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS browser: persisted records, detail, keyboard, configuration gating, live empty state, fetch errors and salesperson handoff/report.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
