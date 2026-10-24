/** Resume publication/QA/export of an existing completed generation, never generation or outreach. */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { z } = await import("zod");
const { db, one, rows, event, update } = await import("../lib/db");
const { env } = await import("../lib/config");
const { runSchema } = await import("../lib/config");
const { runPipeline } = await import("../worker/pipeline");
const id = z.uuid().parse(process.argv[2]);
const run = await one("runs", id);
if (!["COMPLETED", "FAILED"].includes(run.status))
  throw new Error("Run must be stopped before recovery");
const params = runSchema.parse(run.params);
if (!params.selectedBusinessId)
  throw new Error(
    "Existing-site recovery requires an explicitly selected business run",
  );
const history = await rows("events", "business_id", params.selectedBusinessId);
const attempt = history
  .filter((entry) => entry.action === "WHOP_CREATE_ATTEMPT")
  .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
if (
  attempt &&
  !history.some(
    (entry) =>
      ["WHOP_ATTEMPT_ABSENT", "WHOP_PARTIAL_RESUMABLE"].includes(
        entry.action,
      ) && entry.created_at > attempt.created_at,
  )
) {
  // Retry only an attempt the provider never fulfilled, or complete our own recorded unpublished product.
  const [site] = await rows("sites", "business_id", params.selectedBusinessId);
  if (!site) throw new Error("Whop attempt has no recorded site");
  const { whop } = await import("../lib/whop");
  const recorded = (await rows("products", "site_id", site.id)).find(
    (row) => !row.verified,
  );
  let partial = false;
  for await (const product of await whop().products.list({
    account_id: env("WHOP_ACCOUNT_ID"),
  }))
    if (
      product.metadata?.siteId === site.id ||
      product.route.endsWith(`-website-${site.id.slice(0, 8)}`)
    ) {
      if (partial || product.id !== recorded?.whop_product_id)
        throw new Error(
          `Whop product ${product.id} exists for this site; inspect it before recovery`,
        );
      partial = true;
    }
  if (recorded && !partial)
    throw new Error(
      "Recorded Whop product is missing; inspect before recovery",
    );
  await event(
    id,
    params.selectedBusinessId,
    partial ? "WHOP_PARTIAL_RESUMABLE" : "WHOP_ATTEMPT_ABSENT",
    partial
      ? `Unpublished Whop product ${recorded!.whop_product_id} is recorded for this site and will be completed in place.`
      : "Whop account has no product for this site; the failed listing attempt may be retried.",
  );
}
const { data: claimed, error } = await db()
  .from("runs")
  .update({
    status: "RUNNING",
    error: null,
    updated_at: new Date().toISOString(),
  })
  .eq("id", id)
  .eq("status", run.status)
  .select("id")
  .maybeSingle();
if (error) throw error;
if (!claimed) throw new Error("Run already claimed");
const heartbeat = setInterval(() => {
  void update("runs", id, { updated_at: new Date().toISOString() }).catch(
    console.error,
  );
}, 15000);
try {
  await event(
    id,
    params.selectedBusinessId,
    "SITE_RECOVERY_REQUESTED",
    "Resume the existing generated project only. Generation and repair reservations are preserved; product/outreach attempts block recovery.",
  );
  await runPipeline({ id, params }, { resumeExistingSite: true });
} catch (error) {
  await update("runs", id, {
    status: "FAILED",
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  clearInterval(heartbeat);
}
