/** Resume publication/QA/export of an existing completed generation, never generation or outreach. */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { z } = await import("zod");
const { db, one, event, update } = await import("../lib/db");
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
