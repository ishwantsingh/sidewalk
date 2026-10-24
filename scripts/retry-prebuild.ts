/** Retry a failed run only when no billable build or outreach could be replayed. */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { z } = await import("zod");
const { db, one, event, update } = await import("../lib/db");
const { runSchema } = await import("../lib/config");
const { runPipeline } = await import("../worker/pipeline");
const id = z.uuid().parse(process.argv[2]);
const run = await one("runs", id);
if (run.status !== "FAILED") throw new Error("Only failed runs may be retried");
const params = runSchema.parse(run.params);
const { data: businesses, error } = await db()
  .from("businesses")
  .select("id")
  .eq("run_id", id);
if (error) throw error;
const businessIds = (businesses ?? []).map((b) => b.id);
for (const table of ["sites", "emails", "sales_tasks"]) {
  if (!businessIds.length) continue;
  const { count, error } = await db()
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds);
  if (error) throw error;
  if (count)
    throw new Error(
      `Refusing retry: ${table} records exist. Inspect provider state instead.`,
    );
}
// A reservation may precede an ambiguous provider response: records alone are insufficient.
const { data: paidStages, error: stageError } = await db()
  .from("events")
  .select("action")
  .eq("run_id", id)
  .in("action", [
    "LOVABLE_BUILD",
    "LOVABLE_CREATED",
    "LOVABLE_REPAIR",
    "WHOP_LISTED",
    "EMAIL_SENT",
    "SALES_QUEUED",
  ]);
if (stageError) throw stageError;
if (paidStages?.length)
  throw new Error("Refusing retry: a billable build or outreach was attempted");
const { data: claim, error: claimError } = await db()
  .from("runs")
  .update({
    status: "RUNNING",
    error: null,
    updated_at: new Date().toISOString(),
  })
  .eq("id", id)
  .eq("status", "FAILED")
  .select("id")
  .maybeSingle();
if (claimError) throw claimError;
if (!claim) throw new Error("Run was claimed by another process");
const heartbeat = setInterval(() => {
  void update("runs", id, { updated_at: new Date().toISOString() }).catch(
    console.error,
  );
}, 15000);
try {
  await event(
    id,
    null,
    "PREBUILD_RETRY",
    "Explicitly retrying research and audits after verifying no build or outreach was ever attempted. Prior discovery and event history retained.",
  );
  await runPipeline({ id, params }, { retryPreBuild: true });
} catch (error) {
  await update("runs", id, {
    status: "FAILED",
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  clearInterval(heartbeat);
}
