import { request } from "./http";
/** Publication acknowledgements are asynchronous; never mistake a startup page for a QA defect. */
export async function waitForPublication(
  url: string,
  businessName: string,
  timeoutMs = 300000,
) {
  const deadline = Date.now() + timeoutMs;
  let reason = "Public site is not ready";
  while (Date.now() < deadline) {
    try {
      const response = await request(
        url,
        { headers: { "Cache-Control": "no-cache" } },
        true,
      );
      const destination = new URL(response.url || url);
      if (
        destination.hostname === "lovable.dev" &&
        destination.pathname.startsWith("/login")
      )
        throw new Error("Published URL requires Lovable login");
      const html = (await response.text()).toLowerCase();
      const name = businessName.toLowerCase();
      if (
        (html.includes(name) || html.includes(name.replaceAll("&", "&amp;"))) &&
        /unofficial concept.*not affiliated/s.test(html)
      )
        return;
      reason = "Public deployment has not served the business concept yet";
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      if (reason.includes("requires Lovable login")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Publication readiness timed out: ${reason}`);
}
