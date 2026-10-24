import { publicAddress, webUrl } from "./network";
import { Agent, fetch as undiciFetch } from "undici";
// A dispatcher must use the fetch implementation from the same Undici version.
const pinnedFetch = undiciFetch as unknown as typeof globalThis.fetch;
import type { LookupFunction } from "node:net";
const safeAgent = new Agent({
  connect: {
    lookup: ((hostname, options, callback) => {
      void publicAddress(hostname)
        .then((address) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        })
        .catch((error) => callback(error, "", 4));
    }) as LookupFunction,
  },
});
export async function publicUrl(value: string) {
  const url = webUrl(value);
  await publicAddress(url.hostname);
  return url.toString();
}
export async function request(
  url: string,
  init: RequestInit = {},
  safe = false,
): Promise<Response> {
  let target = url;
  for (let redirect = 0; redirect < 6; redirect++) {
    if (safe) await publicUrl(target);
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await (safe ? pinnedFetch : fetch)(target, {
        ...init,
        ...(safe ? { dispatcher: safeAgent } : {}),
        redirect: safe ? "manual" : "follow",
        signal: AbortSignal.timeout(45000),
      });
      if (safe && r.status >= 300 && r.status < 400) {
        target = new URL(r.headers.get("location")!, target).toString();
        break;
      }
      if (r.ok) return r;
      if (
        (r.status === 429 || r.status >= 500) &&
        attempt < 2 &&
        (!init.method ||
          init.method === "GET" ||
          new Headers(init.headers).has("Idempotency-Key"))
      ) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(`Provider HTTP ${r.status}: ${new URL(target).hostname}`);
    }
  }
  throw new Error("Too many redirects");
}
export async function json(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return (
    await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  ).json();
}
