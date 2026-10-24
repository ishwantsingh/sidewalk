import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { db, rows } from "../lib/db";
import { env } from "../lib/config";
import { verifyProduct } from "../lib/commerce";
import { whop } from "../lib/whop";
nextEnv.loadEnvConfig(process.cwd());
const [businesses, audits, sites, products, emails, sales, orders] =
  await Promise.all(
    [
      "businesses",
      "audits",
      "sites",
      "products",
      "emails",
      "sales_tasks",
      "orders",
    ].map((t) => rows(t)),
  );
const checks: [string, boolean][] = [
  [
    "Real discovery with independent provenance",
    businesses.some(
      (b) => b.place_id && b.source_urls.length && b.brief?.facts.length,
    ),
  ],
  [
    "Real website audit",
    audits.some(
      (a) =>
        a.score !== null &&
        a.screenshot_url &&
        a.measurements?.performance !== undefined,
    ),
  ],
  [
    "Two distinct validated source websites",
    new Set(
      sites
        .filter(
          (s) =>
            s.qa_status === "PASSED" &&
            s.zip_path &&
            s.checksum &&
            s.preview_url,
        )
        .map((s) => s.business_id),
    ).size >= 2,
  ],
  [
    "Actual automated sales email acknowledged",
    emails.some(
      (email) => email.status === "SENT" && email.provider_message_id,
    ),
  ],
  [
    "Actual Terac sales call reported and accepted",
    sales.some(
      (task) =>
        task.status === "COMPLETED" && task.report && task.terac_opportunity_id,
    ),
  ],
  [
    "Verified payment and automatic delivery",
    orders.some(
      (o) =>
        o.delivery_state === "DELIVERED" &&
        o.delivery_message_id &&
        o.whop_payment_id,
    ),
  ],
];
for (const site of sites.filter((s) => s.zip_path)) {
  const { data, error } = await db()
    .storage.from(env("SUPABASE_ZIP_BUCKET"))
    .download(site.zip_path);
  if (error) throw error;
  const checksum = createHash("sha256")
    .update(Buffer.from(await data.arrayBuffer()))
    .digest("hex");
  checks.push([`Archive integrity ${site.id}`, checksum === site.checksum]);
  const product = products.find((p) => p.site_id === site.id);
  checks.push([`Unique verified Whop product ${site.id}`, !!product?.verified]);
  if (product?.verified) {
    await verifyProduct(
      product.storefront_url,
      product.purchase_url,
      businesses.find((b) => b.id === site.business_id)!.name,
      Number(product.amount),
    );
  }
}
for (const order of orders) {
  const payment = await whop().payments.retrieve({ id: order.whop_payment_id });
  checks.push([
    `Whop payment ${order.whop_payment_id}${order.internal ? " (internal verification)" : ""}`,
    payment.status === "paid",
  ]);
}
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
