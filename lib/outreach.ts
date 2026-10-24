import { db, insert, update, event } from "./db";
import { env } from "./config";
import { verifiedSender, sendMail, optoutUrl } from "./mail";
import type { Brief } from "./research";
export type SalesEmailContext = {
  status: "SENT" | "EMAIL_FAILED" | "NO_EMAIL" | "SEND_LIMIT" | "OPTED_OUT";
  address?: string;
  subject?: string;
  body?: string;
  sentAt?: string;
  providerMessageId?: string;
  error?: string;
};
export async function sendOutreach(
  run: string,
  business: string,
  brief: Brief,
  site: Record<string, any>,
  product: Record<string, any>,
  audit: Record<string, any>,
): Promise<SalesEmailContext> {
  if (!brief.contactEmail) return { status: "NO_EMAIL" };
  const { data, error } = await db()
    .from("emails")
    .select("id")
    .ilike("address", brief.contactEmail)
    .eq("opted_out", true);
  if (error) throw error;
  if (data?.length) return { status: "OPTED_OUT", address: brief.contactEmail };
  const email = await insert("emails", {
    business_id: business,
    address: brief.contactEmail,
    status: "PENDING",
  });
  const optout = optoutUrl(email.id);
  const gap =
    audit.classification === "NO_WEBSITE"
      ? "we could not find an official website after checking independent public sources"
      : `your website has a specific issue: ${audit.defects[0]}`;
  const subject = `We made a website concept for ${brief.name}`;
  const body = `Hi ${brief.name} team,\n\nWe noticed ${gap}, so we created an unofficial website concept for your business.\n\nPreview the finished site: ${site.preview_url}\nBuy the website source files: ${product.storefront_url}\n\nThe website is already built. If you purchase it on Whop, you will automatically receive a ZIP with the code and setup instructions. The one-time price is $${product.amount}.\n\nThis is a commercial offer from Sidewalk AI, not a message sent by or on behalf of your business.\n\n${env("SENDER_NAME")}\n${env("SENDER_POSTAL_ADDRESS")}\nOpt out of future offers: ${optout}`;
  await update("emails", email.id, { subject, body });
  const context = { address: brief.contactEmail, subject, body };
  try {
    await verifiedSender();
    const providerMessageId = await sendMail(
      brief.contactEmail,
      subject,
      body,
      `outreach-${email.id}`,
      {
        "List-Unsubscribe": `<${optout}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    );
    const sentAt = new Date().toISOString();
    await update("emails", email.id, {
      provider_message_id: providerMessageId,
      status: "SENT",
      sent_at: sentAt,
    });
    await event(
      run,
      business,
      "EMAIL_SENT",
      `Provider acknowledged ${providerMessageId}; recipient ${brief.contactEmail}. Inbox receipt is not verified.`,
    );
    return { ...context, status: "SENT", providerMessageId, sentAt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await update("emails", email.id, { status: "EMAIL_FAILED", error: reason });
    await event(run, business, "EMAIL_FAILED", reason);
    return { ...context, status: "EMAIL_FAILED", error: reason };
  }
}
