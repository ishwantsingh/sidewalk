import { whop } from "./whop";
import { chromium } from "playwright";
import { env } from "./config";
import { slug } from "./domain";
import { request } from "./http";
import { insert, rows, update } from "./db";
import { createHash } from "node:crypto";
import type { Brief } from "./research";

export function productDescription(
  name: string,
  preview: string,
  amount: number,
  brief?: Brief,
) {
  const location = brief?.facts.find((fact) =>
    /address|location/i.test(fact.label),
  )?.value;
  const context = [
    name.slice(0, 100),
    brief?.category?.slice(0, 60),
    location?.slice(0, 140),
  ]
    .filter(Boolean)
    .join(" · ");
  const details = [
    `LIVE PREVIEW: ${preview}`,
    `PRICE: $${amount.toFixed(2)} USD, one-time purchase. One source-code package available; no subscription.`,
    "WHAT YOU GET: The React website shown in the preview, editable source files in a ZIP, dependency lockfile, and a README with local preview, build and deployment instructions. The gallery shows the actual generated website.",
    "DELIVERY: After confirmed payment, a secure download link is emailed to the email address used at checkout. The link is valid for 7 days. Save the ZIP after downloading.",
    "SETUP: Node.js 22+ is required to build locally. You or your developer can edit the source, run npm install and npm run build, and deploy the built files to a static host.",
    "SCOPE: Source code only. Hosting, domain registration, ongoing maintenance, custom revisions, backend services, booking and payment integrations are not included. Remote business photos remain subject to their source rights and availability.",
    "This is an independent concept, not an official business listing or an offer endorsed by the business. Review the live preview before purchasing.",
  ].join("\n\n");
  const intro = "A ready-built, unofficial website concept for ";
  // Keep all purchase/delivery terms and the full preview URL when context is long.
  const contextLimit = Math.max(0, 1500 - details.length - intro.length - 3);
  return `${intro}${context.slice(0, contextLimit)}.\n\n${details}`;
}
// Same request retries replay; a changed request body gets a fresh key instead of a provider mismatch.
const requestKey = (step: string, siteId: string, body: unknown) =>
  `whop-${step}-${siteId}-${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16)}`;
export async function listProduct(
  site: {
    id: string;
    screenshot_url: string;
    business_id: string;
    preview_url: string;
  },
  name: string,
  amount: number,
  brief?: Brief,
) {
  const client = whop();
  const headline = `Unofficial website concept for ${name}`.slice(0, 80);
  const description = productDescription(name, site.preview_url, amount, brief);
  if (description.length > 1500)
    throw new Error("Whop description exceeds 1500 characters");
  // A listing whose publish failed is completed in place, never duplicated.
  const partial = (await rows("products", "site_id", site.id)).find(
    (row) => !row.verified,
  );
  let product: { id: string; route: string };
  let saved: Record<string, any>;
  let plan: { id: string; purchase_url: string } | undefined;
  if (partial) {
    const existing = await client.products.retrieve({
      id: partial.whop_product_id,
    });
    if (existing.metadata?.siteId !== site.id)
      throw new Error("Recorded Whop product belongs to another site");
    product = await client.products.update({
      id: existing.id,
      headline,
      description,
    });
    saved = partial;
    for await (const variant of await client.variants.list({
      account_id: env("WHOP_ACCOUNT_ID"),
      product_ids: existing.id,
    }))
      if (variant.metadata?.siteId === site.id) plan = variant;
  } else {
    const fileRequest = {
      filename: `${slug(name)}.png`,
      visibility: "public" as const,
    };
    const file = await client.files.create(fileRequest, {
      idempotencyKey: requestKey("file", site.id, fileRequest),
    });
    if (!file.upload_url) throw new Error("Whop returned no image upload URL");
    const uploaded =
      (await client.files.retrieve({ id: file.id })).upload_status === "ready";
    const bytes = await (await request(site.screenshot_url)).arrayBuffer();
    if (!uploaded)
      await request(file.upload_url, {
        method: "PUT",
        headers: Object.fromEntries(
          Object.entries(file.upload_headers ?? {}).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
        body: bytes,
      });
    let ready = false;
    for (let n = 0; n < 20; n++) {
      const check = await client.files.retrieve({ id: file.id });
      if (check.upload_status === "ready") {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!ready) throw new Error("Whop image upload did not become ready");
    const productRequest = {
      account_id: env("WHOP_ACCOUNT_ID"),
      title: `Website for ${name}`.slice(0, 80),
      headline,
      description,
      route: `${slug(name)}-website-${site.id.slice(0, 8)}`,
      gallery_images: [{ id: file.id }],
      metadata: { siteId: site.id, leadId: site.business_id },
      visibility: "visible" as const,
    };
    product = await client.products.create(productRequest, {
      idempotencyKey: requestKey("product", site.id, productRequest),
    });
    saved = await insert("products", {
      site_id: site.id,
      whop_product_id: product.id,
      amount,
    });
  }
  if (!plan) {
    const planRequest = {
      account_id: env("WHOP_ACCOUNT_ID"),
      product_id: product.id,
      plan_type: "one_time",
      initial_price: amount,
      currency: "usd",
      stock: 1,
      unlimited_stock: false,
      visibility: "visible",
      release_method: "buy_now",
      metadata: { siteId: site.id, leadId: site.business_id },
    };
    plan = await client.variants.create(planRequest, {
      idempotencyKey: requestKey("plan", site.id, planRequest),
    });
  }
  const account = await client.accounts.retrieve({
    id: env("WHOP_ACCOUNT_ID"),
  });
  const storefront = productPageUrl(account.route, product.route);
  await update("products", saved.id, {
    whop_plan_id: plan.id,
    storefront_url: storefront,
    purchase_url: plan.purchase_url,
  });
  const published = await client.products.retrieve({ id: product.id });
  if (!published.gallery_images.length)
    throw new Error("Whop product screenshot missing");
  if (published.description !== description)
    throw new Error("Whop product description is missing or incomplete");
  await verifyProduct(
    storefront,
    plan.purchase_url,
    name,
    amount,
    published.gallery_images[0].url ?? undefined,
  );
  await update("products", saved.id, { verified: true });
  return {
    ...saved,
    storefront_url: storefront,
    purchase_url: plan.purchase_url,
    verified: true,
  };
}
export function productPageUrl(accountRoute: string, productRoute: string) {
  if (
    !/^[a-z0-9_-]+$/i.test(accountRoute) ||
    !/^[a-z0-9-]+$/i.test(productRoute)
  )
    throw new Error("Invalid Whop storefront route");
  return `https://whop.com/${accountRoute}/${productRoute}/`;
}
export function hasPrice(text: string, price: number) {
  return [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].some(
    (match) => Number(match[1].replaceAll(",", "")) === price,
  );
}
export async function verifyProduct(
  url: string,
  checkout: string,
  name: string,
  price: number,
  imageUrl?: string,
) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: "en-US" });
    // Whop keeps live connections open, so the page never reaches network idle.
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: 45000,
    });
    if (!response?.ok()) throw new Error("Whop product page is unavailable");
    await page
      .getByText(name, { exact: false })
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    const text = await page.locator("body").innerText();
    if (!text.includes(name) || !hasPrice(text, price))
      throw new Error("Whop page does not show the correct name and price");
    const imageVisible = await page.locator("img").evaluateAll(
      (images, expected) =>
        images.some((el) => {
          if (
            !(el instanceof HTMLImageElement) ||
            !el.complete ||
            el.naturalWidth < 100 ||
            el.getBoundingClientRect().width === 0
          )
            return false;
          return (
            !expected ||
            decodeURIComponent(el.currentSrc || el.src).includes(
              new URL(expected).pathname,
            )
          );
        }),
      imageUrl,
    );
    if (!imageVisible)
      throw new Error("Actual Whop product screenshot is not visible");
    const target = new URL(checkout);
    if (target.hostname !== "whop.com")
      throw new Error("Checkout must be Whop-native");
    const checkoutLink = page.locator(`a[href*="${target.pathname}"]`).first();
    if (await checkoutLink.count()) {
      await checkoutLink.click();
    } else {
      const buy = page
        .getByRole("button", {
          name: /^(buy now|order now|get access|purchase|pay|complete order)$/i,
        })
        .first();
      if (!(await buy.count()))
        throw new Error("No Whop purchase control found");
      const planId = checkout.match(/plan_[a-zA-Z0-9]+/)?.[0];
      if (!planId)
        throw new Error("Checkout URL is missing a variant identifier");
      let matched = false;
      const listener = (req: import("playwright").Request) => {
        if ((req.url() + (req.postData() ?? "")).includes(planId))
          matched = true;
      };
      page.on("request", listener);
      await buy.click();
      for (let attempt = 0; attempt < 30; attempt++) {
        if (
          matched ||
          page.url().includes(planId) ||
          page.frames().some((frame) => frame.url().includes(planId))
        )
          break;
        await page.waitForTimeout(500);
      }
      page.off("request", listener);
      if (
        !matched &&
        !page.url().includes(planId) &&
        !page.frames().some((frame) => frame.url().includes(planId))
      )
        throw new Error(
          "Purchase control did not lead to the exact Whop checkout",
        );
    }
    await request(checkout);
  } finally {
    await browser.close();
  }
}
