import { env } from "./config";
import { json, request } from "./http";
import { createHmac, timingSafeEqual } from "node:crypto";
export function signature(value: string) {
  return createHmac("sha256", env("DOWNLOAD_SIGNING_SECRET"))
    .update(value)
    .digest("hex");
}
export function verifySignature(value: string, sig: string) {
  const expected = signature(value);
  return (
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
}
export async function verifiedSender() {
  const domain = await (
    await request(`https://api.resend.com/domains/${env("RESEND_DOMAIN_ID")}`, {
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` },
    })
  ).json();
  const from = env("EMAIL_FROM").match(/@([^>\s]+)/)?.[1];
  if (domain.status !== "verified" || domain.name !== from)
    throw new Error("Sender domain is not verified");
  env("SENDER_POSTAL_ADDRESS");
}
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  key: string,
  headers: Record<string, string> = {},
) {
  const sent = await json(
    "https://api.resend.com/emails",
    { from: env("EMAIL_FROM"), to: [to], subject, text, headers },
    {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Idempotency-Key": key,
    },
  );
  if (!sent.id)
    throw new Error("Email provider did not acknowledge delivery submission");
  return sent.id as string;
}
export function optoutUrl(id: string) {
  return `${env("APP_URL")}/api/opt-out/${id}?signature=${signature(`optout:${id}`)}`;
}
