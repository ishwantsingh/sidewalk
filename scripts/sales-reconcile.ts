import nextEnv from "@next/env";
import { z } from "zod";
import { one, update } from "../lib/db";
import { Terac } from "../lib/terac";
import { verifySalesSubmission } from "../lib/sales";
nextEnv.loadEnvConfig(process.cwd());
const id = z.uuid().parse(process.argv[2]);
const task = await one("sales_tasks", id);
if (task.status !== "NEEDS_REVIEW")
  throw new Error("Only NEEDS_REVIEW assignments can be reconciled");
const args = process.argv.slice(3);
if (args.length && (args.length !== 2 || args[0] !== "--opportunity"))
  throw new Error(
    "Usage: npm run sales:reconcile -- TASK_UUID [--opportunity PROVIDER_ID]",
  );
const opportunityId = task.terac_opportunity_id ?? args[1];
if (!opportunityId)
  throw new Error(
    `Find the draft named 'Sidewalk sales ${id}' in Terac, then supply --opportunity PROVIDER_ID. No task was recreated.`,
  );
const terac = new Terac();
try {
  await terac.connect();
  const opportunity = await terac.call("terac_get_opportunity", {
    opportunity_id: opportunityId,
  });
  if (
    opportunity.internal_title !== `Sidewalk sales ${id}` &&
    opportunity.internalTitle !== `Sidewalk sales ${id}`
  )
    throw new Error(
      "Provider opportunity internal title does not match this assignment",
    );
  const providerStatus = String(opportunity.status).toLowerCase();
  let status: string;
  if (providerStatus === "draft") status = "DRAFT";
  else if (
    [
      "active",
      "live",
      "recruiting",
      "published",
      "launched",
      "approved",
      "completed",
    ].includes(providerStatus)
  ) {
    if (task.report) {
      await verifySalesSubmission(
        terac,
        { ...task, terac_opportunity_id: opportunityId },
        task.report.submissionId,
      );
      status = "REPORTED";
    } else if (providerStatus !== "completed") status = "RECRUITING";
    else
      throw new Error(
        "Terac completed without a local call report; inspect before proceeding",
      );
  } else throw new Error(`Cannot resume provider status ${providerStatus}`);
  await update("sales_tasks", id, {
    status,
    terac_opportunity_id: opportunityId,
    error: null,
    next_poll_at: new Date().toISOString(),
  });
  console.log(`Reconciled ${id}: ${status}. No provider mutation was made.`);
} finally {
  await terac.close();
}
