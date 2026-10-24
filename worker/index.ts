import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const { db, update, event } = await import("../lib/db");
const { missingConfig } = await import("../lib/config");
const { runPipeline } = await import("./pipeline");
const { deliverOrder } = await import("../lib/fulfillment");
const missing = missingConfig();
if (missing.length)
  throw new Error(
    `Configure .env.local before starting worker: ${missing.join(", ")}`,
  );
let stopping = false,
  delivering = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function recover() {
  // Heartbeats distinguish a live long build from a terminated worker. Never replay a billable stage.
  const { error } = await db()
    .from("runs")
    .update({
      status: "FAILED",
      error:
        "Worker lost its heartbeat. Inspect persisted stages before starting a new run.",
    })
    .eq("status", "RUNNING")
    .lt("updated_at", new Date(Date.now() - 120000).toISOString());
  if (error) throw error;
  const { error: deliveryError } = await db()
    .from("orders")
    .update({
      delivery_state: "EMAIL_FAILED",
      next_attempt_at: new Date().toISOString(),
    })
    .eq("delivery_state", "SENDING")
    .lt("delivery_claimed_at", new Date(Date.now() - 600000).toISOString());
  if (deliveryError) throw deliveryError;
}
async function deliveries() {
  if (delivering || stopping) return;
  delivering = true;
  try {
    const { data, error } = await db()
      .from("orders")
      .select("id")
      .in("delivery_state", ["PENDING", "EMAIL_FAILED"])
      .lte("next_attempt_at", new Date().toISOString())
      .lt("delivery_attempts", 10);
    if (error) throw error;
    for (const order of data ?? []) await deliverOrder(order.id);
  } catch (error) {
    console.error("Fulfillment queue failed", error);
  } finally {
    delivering = false;
  }
}
// Keep fulfillment responsive while the same worker awaits a long Lovable build.
const deliveryTimer = setInterval(() => void deliveries(), 3000);
console.log("Sidewalk worker ready");
while (!stopping) {
  try {
    await recover();
    await deliveries();
    const { data: runs, error } = await db().rpc("claim_run");
    if (error) throw error;
    if (runs?.[0]) {
      const run = runs[0];
      const heartbeat = setInterval(() => {
        void update("runs", run.id, {
          updated_at: new Date().toISOString(),
        }).catch(console.error);
      }, 15000);
      try {
        await runPipeline(run);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await update("runs", run.id, { status: "FAILED", error: reason });
        await event(run.id, null, "RUN_FAILED", reason);
      } finally {
        clearInterval(heartbeat);
      }
    }
  } catch (error) {
    console.error("Worker iteration failed", error);
  }
  if (!stopping) await new Promise((r) => setTimeout(r, 3000));
}
clearInterval(deliveryTimer);
while (delivering) await new Promise((r) => setTimeout(r, 100));
