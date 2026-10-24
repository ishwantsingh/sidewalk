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
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.getByText("Demo data", { exact: true }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 12);
  const map = page.getByRole("region", { name: "Business discovery map" });
  await map.getByRole("combobox", { name: "Map neighborhood" }).waitFor();
  assert.equal(
    await map.getByRole("combobox", { name: "Map neighborhood" }).inputValue(),
    "Williamsburg, Brooklyn",
  );
  assert.equal(await map.locator(".sample-marker").count(), 6);
  assert.equal(
    await map.locator('.sample-marker[aria-label$="Good website"]').count(),
    1,
  );
  assert.equal(
    await map.locator('.sample-marker[aria-label$="Poor website"]').count(),
    2,
  );
  assert.equal(
    await map.locator('.sample-marker[aria-label$="No website"]').count(),
    3,
  );
  await map
    .getByRole("button", { name: "Sunday Coffee · No website", exact: true })
    .click();
  await map
    .getByRole("region", { name: "Sunday Coffee", exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await map
    .getByRole("button", { name: "Wythe Barber · Good website", exact: true })
    .click();
  await map
    .getByRole("region", { name: "Wythe Barber", exact: true })
    .waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/map-inspector-desktop.png" });
  await page.setViewportSize({ width: 375, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Map inspector overflows mobile",
  );
  await page.screenshot({
    path: "artifacts/map-inspector-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await map.getByRole("button", { name: "Close detail" }).click();
  await map.getByRole("button", { name: /^Good website/ }).click();
  assert.equal(await map.locator(".sample-marker").count(), 1);
  await map.getByRole("button", { name: /^All / }).click();
  await map
    .getByRole("combobox", { name: "Map neighborhood" })
    .selectOption("Greenpoint, Brooklyn");
  assert.equal(await map.locator(".sample-marker").count(), 6);
  assert.equal(
    await map.locator('.sample-marker[aria-label$="Needs review"]').count(),
    1,
  );
  await map.getByRole("button", { name: "Search this area" }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Neighborhood or city" })
      .inputValue(),
    "Greenpoint, Brooklyn",
  );
  await page.keyboard.press("Escape");
  await map
    .getByRole("combobox", { name: "Map neighborhood" })
    .selectOption("Williamsburg, Brooklyn");

  assert.equal(
    await page.getByRole("img", { name: /Daily revenue/ }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("img", { name: /Pipeline totals/ }).count(),
    1,
  );
  for (const text of [
    "AUTONOMOUS WEBSITE AGENCY",
    "Agency overview.",
    "Setup required",
    "Single worker",
    "Workspace /",
    "Refreshes every 5s",
    "Your next opportunity starts here.",
    "Every action,",
  ]) {
    assert.equal(
      await page.getByText(text, { exact: false }).count(),
      0,
      `Removed copy: ${text}`,
    );
  }
  assert.equal(await page.locator("aside").count(), 0);
  assert.equal(await page.locator(".eyebrow, .breadcrumb, .rail").count(), 0);
  const colors = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "body *:not(.map-workspace):not(.map-workspace *)",
      ),
    )
      .flatMap((el) => {
        const style = getComputedStyle(el);
        return [
          style.color,
          style.backgroundColor,
          style.borderTopColor,
          style.fill,
          style.stroke,
        ];
      })
      .filter((value) => /^rgba?\(/.test(value)),
  );
  for (const color of colors) {
    const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
    assert(r === g && g === b, `Non-grayscale color: ${color}`);
  }
  await page.getByRole("button", { name: "Poor website", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 5);
  await page.getByRole("button", { name: "All businesses" }).click();
  await page.getByRole("textbox", { name: "Search businesses" }).fill("Sunday");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page
    .getByRole("button", { name: "Sunday Coffee", exact: true })
    .click();
  await page.getByRole("region", { name: "Sunday Coffee" }).waitFor();
  await page.getByRole("heading", { name: "Economics", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert(
    await page
      .getByRole("button", { name: "Sunday Coffee", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await page
    .getByRole("textbox", { name: "Search businesses" })
    .fill("no matches");
  await page
    .getByText("No matching businesses. Adjust your filters.")
    .waitFor();
  await page.getByRole("textbox", { name: "Search businesses" }).fill("");
  await page
    .getByRole("combobox", { name: "Filter by run" })
    .selectOption("demo-run-1");
  assert.equal(await page.locator("tbody tr").count(), 6);
  await page.getByRole("combobox", { name: "Filter by run" }).selectOption("");
  await page.getByRole("button", { name: "New run" }).click();
  assert(
    await page
      .getByRole("button", { name: "Start run", exact: true })
      .isDisabled(),
  );
  await page.keyboard.press("Escape");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 375]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow at ${width}px`,
    );
  }
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
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
  await page.keyboard.press("Escape");
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      assert.equal(body.area, "Brooklyn");
      assert.equal(body.maxSalesTasks, 2);
      assert.equal(body.maxRealEmails, 2);
      await route.fulfill({ status: 201, json: { id: "live-run" } });
    } else
      await route.fulfill({
        json: [
          {
            id: "live-run",
            params: { area: "Brooklyn" },
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
    audits: [],
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
    .getByRole("button", { name: "Live business", exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.equal(
    await page.getByText("Sunday Coffee", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Live business", exact: true })
    .click();
  await page.getByRole("region", { name: "Live business" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New run" }).click();
  await page
    .getByRole("textbox", { name: "Neighborhood or city" })
    .fill("Brooklyn");
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(
    await page.getByRole("combobox", { name: "Filter by run" }).inputValue(),
    "live-run",
  );
  // A database connection alone still uses the demo when providers are not configured.
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { missing: ["OPENAI_API_KEY"] } }),
  );
  await page.reload();
  await page.getByText("Demo data", { exact: true }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 12);
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
    "PASS browser: JSON demo, map statuses and inspector, neutral dashboard, charts, search, filters, detail, keyboard, mobile, configuration gating, live empty state, fetch errors and salesperson handoff/report.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
