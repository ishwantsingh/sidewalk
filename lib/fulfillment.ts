import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { db, one, update, event } from "./db";
import { env } from "./config";
import { sendMail } from "./mail";
import { whop } from "./commerce";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function acceptPayment(eventId: string, paymentId: string) {
  const payment = await whop().payments.retrieve({ id: paymentId });
  if (
    payment.status !== "paid" ||
    payment.account_id !== env("WHOP_ACCOUNT_ID")
  )
    throw new Error("Payment is not paid to this account");
  const { data: product, error } = await db()
    .from("products")
    .select("*")
    .eq("whop_product_id", payment.product_id)
    .eq("whop_plan_id", payment.plan_id)
    .single();
  if (error || !product)
    throw new Error("Payment does not match a website product and plan");
  if (!payment.total) throw new Error("Payment total missing");
  const amount = Number(payment.total.amount),
    currency = payment.total.currency;
  if (
    !Number.isFinite(amount) ||
    amount < Number(product.amount) ||
    currency !== product.currency
  )
    throw new Error("Payment amount/currency mismatch");
  const email = z.email().parse(payment.customer_email);
  const internal = (process.env.INTERNAL_BUYER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(email.toLowerCase());
  const { data: inserted, error: insertError } = await db()
    .from("orders")
    .insert({
      whop_payment_id: payment.id,
      whop_event_id: eventId,
      product_id: product.id,
      buyer_email: email,
      amount,
      currency,
      internal,
    })
    .select()
    .maybeSingle();
  if (insertError && insertError.code !== "23505") throw insertError;
  if (inserted) {
    const site = await one("sites", product.site_id);
    const business = await one("businesses", site.business_id);
    await update("businesses", business.id, { state: "PAID" });
    await event(
      business.run_id,
      business.id,
      "PAID",
      `Whop payment ${payment.id}: ${currency.toUpperCase()} ${amount}${internal ? " (internal verification transaction)" : ""}`,
    );
  }
}
export async function deliverOrder(orderId: string) {
  const { data: order, error: claimError } = await db()
    .from("orders")
    .update({
      delivery_state: "SENDING",
      delivery_claimed_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .in("delivery_state", ["PENDING", "EMAIL_FAILED"])
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  if (!order) return;
  try {
    const product = await one("products", order.product_id);
    const site = await one("sites", product.site_id);
    const business = await one("businesses", site.business_id);
    if (!site.zip_path || !site.checksum || site.qa_status !== "PASSED")
      throw new Error("Paid site has no validated source archive");
    const expired =
      !!order.download_expires_at &&
      new Date(order.download_expires_at).getTime() <= Date.now();
    const generation = order.delivery_generation + (expired ? 1 : 0);
    // A stable token/expiry per generation preserves idempotent retries; renewal revokes the old link.
    const token = createHmac("sha256", env("DOWNLOAD_SIGNING_SECRET"))
      .update(`${order.id}:${generation}`)
      .digest("hex");
    const expires =
      !expired && order.download_expires_at
        ? order.download_expires_at
        : new Date(Date.now() + 7 * 86400000).toISOString();
    await update("orders", order.id, {
      download_token_hash: hashToken(token),
      download_expires_at: expires,
      delivery_generation: generation,
    });
    const link = `${env("APP_URL")}/api/download/${token}`;
    const message = await sendMail(
      order.buyer_email,
      `Your ${business.name} website source files`,
      `Thank you for your purchase.\n\nDownload your website ZIP (expires ${expires}):\n${link}\n\nSHA-256: ${site.checksum}\n\nUnzip, install Node.js 22+, run npm install, then npm run build. Deploy dist to a static host. The included README explains local preview and deployment. This purchase includes source code only.\n\n${env("SENDER_NAME")}`,
      `delivery-${order.id}-${generation}`,
    );
    await update("orders", order.id, {
      delivery_state: "DELIVERED",
      delivery_message_id: message,
      error: null,
    });
    await update("businesses", business.id, { state: "ZIP_DELIVERED" });
    await event(
      business.run_id,
      business.id,
      "ZIP_DELIVERED",
      `Delivery email acknowledged by provider: ${message}${order.internal ? " (internal verification purchase)" : ""}`,
    );
  } catch (error) {
    await update("orders", order.id, {
      delivery_state: "EMAIL_FAILED",
      error: error instanceof Error ? error.message : String(error),
      delivery_attempts: order.delivery_attempts + 1,
      next_attempt_at: new Date(
        Date.now() + Math.min(3600000, 60000 * 2 ** order.delivery_attempts),
      ).toISOString(),
    });
  }
}
