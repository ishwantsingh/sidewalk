import { whop } from "./whop";
import { chromium } from "playwright";
import { env } from "./config";
import { slug } from "./domain";
import { request } from "./http";
import { insert, update } from "./db";
export async function listProduct(
  site: {
    id: string;
    screenshot_url: string;
    business_id: string;
    preview_url: string;
  },
  name: string,
  amount: number,
) {
  const client = whop(`product-${site.id}`);
  const file = await client.files.create({
    filename: `${slug(name)}.png`,
    visibility: "public",
  });
  if (!file.upload_url) throw new Error("Whop returned no image upload URL");
  const bytes = await (await request(site.screenshot_url)).arrayBuffer();
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
  const route = `${slug(name)}-website-${site.id.slice(0, 8)}`;
  const product = await client.products.create({
    account_id: env("WHOP_ACCOUNT_ID"),
    title: `Website for ${name}`,
    description: `Unofficial responsive website concept for ${name}. One-time purchase of React website source ZIP and deployment instructions. No hosting or domain service. Preview: ${site.preview_url}`,
    route,
    gallery_images: [{ id: file.id }],
    metadata: { siteId: site.id, leadId: site.business_id },
    visibility: "visible",
  });
  const saved = await insert("products", {
    site_id: site.id,
    whop_product_id: product.id,
    amount,
  });
  const plan = await whop(`plan-${site.id}`).variants.create({
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
  });
  await client.products.publish({ id: product.id });
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
    !/^[a-z0-9-]+$/i.test(accountRoute) ||
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
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    if (!response?.ok()) throw new Error("Whop product page is unavailable");
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
