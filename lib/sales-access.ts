import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./config";
export function salesSignature(id: string) {
  return createHmac("sha256", env("DOWNLOAD_SIGNING_SECRET"))
    .update(`sales:${id}`)
    .digest("hex");
}
export function validSalesSignature(id: string, signature: string) {
  return (
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(salesSignature(id)))
  );
}
