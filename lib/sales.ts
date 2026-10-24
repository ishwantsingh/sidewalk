import { z } from "zod";
import { db, insert, update, event, type one } from "./db";
import { cost, env } from "./config";
import type { Brief } from "./research";
import { Terac } from "./terac";
import type { SalesEmailContext } from "./outreach";
import { salesSignature } from "./sales-access";
type Row = Awaited<ReturnType<typeof one>>;
export class SalesReviewRequired extends Error {}
export const callReportSchema = z
  .object({
    submissionId: z.string().min(1).max(200),
    outcome: z.enum([
      "INTERESTED",
      "DECLINED",
      "NO_ANSWER",
      "WRONG_NUMBER",
      "DO_NOT_CALL",
      "PURCHASE_REPORTED",
    ]),
    notes: z.string().trim().min(10).max(4000),
    calledAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (report) => new Date(report.calledAt).getTime() <= Date.now() + 60000,
    "Call time cannot be in the future",
  );
export function salesBrief(
  brief: Brief,
  site: Row,
  product: Row,
  audit: Row,
  email: SalesEmailContext = { status: "NO_EMAIL" },
) {
  if (!brief.contactPhone || !brief.phoneSource)
    throw new Error("A sourced public business phone is required");
  if (!product.verified || site.qa_status !== "PASSED" || !site.zip_path)
    throw new Error(
      "Sales requires a validated live site, source archive and Whop product",
    );
  return {
    salesEmail: email,
    business: brief.name,
    category: brief.category,
    phone: brief.contactPhone,
    phoneSource: brief.phoneSource,
    email: brief.contactEmail,
    emailSource: brief.contactSource,
    facts: brief.facts,
    originalWebsite: brief.officialWebsite,
    websiteFindings: {
      classification: audit.classification,
      defects: audit.defects,
    },
    liveWebsite: site.preview_url,
    storefront: product.storefront_url,
    checkout: product.purchase_url,
    priceUsd: Number(product.amount),
    offer:
      "One-time purchase of the completed website source ZIP and setup instructions. Automatic private download delivery after verified Whop payment. Hosting, domain registration, ongoing maintenance and custom changes are not included.",
    instructions:
      "Make one sales call to the publicly listed business during its local business hours. Read the salesEmail context first. When its status is SENT, refer to the exact email subject and explain the same offer; provider acceptance does not prove inbox receipt. If it failed or was not sent, explain the offer directly and do not say an email was sent. Introduce yourself as calling for Sidewalk AI, ask for the owner or decision-maker, explain the website concept and price, and direct interested owners to the exact Whop store link. Do not claim affiliation with the business or promise sales results. Do not collect payment details or accept payment outside Whop. Do not record the call. Honor a refusal or do-not-call request immediately. If unanswered, report it; do not repeatedly call. Submit an honest call outcome and notes, including objections and whether the store link was shared. A purchase claim is self-reported; Whop independently verifies payment. You are paid for completing the assigned call attempt and report, not guaranteed a sale.",
  };
}
export async function queueSalesTask(
  run: string,
  business: string,
  brief: Brief,
  site: Row,
  product: Row,
  audit: Row,
  email: SalesEmailContext = { status: "NO_EMAIL" },
) {
  const { data: suppressed, error } = await db()
    .from("sales_suppressions")
    .select("phone")
    .eq("phone", brief.contactPhone!.replace(/\D/g, ""));
  if (error) throw error;
  if (suppressed?.length) {
    await event(
      run,
      business,
      "DO_NOT_CALL",
      "Public business phone is suppressed; no salesperson assigned.",
    );
    return;
  }
  const task = await insert("sales_tasks", {
    run_id: run,
    business_id: business,
    brief: salesBrief(brief, site, product, audit, email),
    max_cost_usd: cost("TERAC_MAX_TASK_COST_USD"),
  });
  await update("businesses", business, { state: "SALES_QUEUED" });
  await event(
    run,
    business,
    "SALES_QUEUED",
    `Sales task ${task.id} queued with live website, exact Whop listing and sourced phone.`,
  );
}
export function salesOpportunity(task: Row) {
  const url = `${env("APP_URL")}/sales/${task.id}?signature=${salesSignature(task.id)}`;
  if (new URL(url).protocol !== "https:")
    throw new Error("Terac sales tasks require a public HTTPS APP_URL");
  return {
    project_id: env("TERAC_PROJECT_ID"),
    internal_title: `Sidewalk sales ${task.id}`,
    title: "Make one small-business website sales call",
    description:
      "Call one business owner about an already-built website. Review the supplied brief, show the live preview, explain the one-time source-code offer, direct them to Whop checkout and report the outcome. Complete within 30 minutes of accepting, during local business hours. Paid for a genuine call attempt and report; a sale is not guaranteed.",
    candidate_profile:
      "Experienced English-speaking outbound salesperson or SDR who has sold websites or digital services to US small businesses. Must be able to place a real phone call during the business's local opening hours and accurately log the result.",
    business_type: "b2b",
    num_participants: 1,
    expected_days_to_complete: 1,
    screening_questions: [
      {
        key: "sales_experience",
        text: "Have you personally made outbound sales calls offering websites or digital services to small-business owners?",
        pick: "one",
        answers: [
          { text: "Yes", qualify_logic: "must" },
          { text: "No", qualify_logic: "reject" },
        ],
      },
    ],
    tasks: [
      {
        sequence: 1,
        task_type: "activity",
        review_type: "manual_review",
        title: "Call the business and submit your outcome",
        duration_minutes: 20,
        task_url: url,
        description:
          "Open the sales brief, review the live site and offer, make one call, and submit the report. Return here to mark the task complete. Keep the brief link private.",
      },
    ],
  };
}
export function opportunityQuote(result: Row) {
  const total = result.pricing?.total_cost_cents;
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    result.pricing?.currency !== "usd"
  )
    throw new Error("Terac draft has no supported all-in USD quote");
  return total / 100;
}
export async function verifySalesSubmission(
  terac: Terac,
  task: Row,
  submissionId: string,
) {
  const submission = await terac.call("terac_get_submission", {
    submission_id: submissionId,
  });
  const opportunity =
    submission.opportunity_id ??
    submission.opportunityId ??
    submission.opportunity?.id;
  if (opportunity !== task.terac_opportunity_id)
    throw new SalesReviewRequired(
      "Terac submission does not belong to this sales task",
    );
  if (
    ["rejected", "screened_out", "cancelled", "not_selected"].includes(
      String(submission.status).toLowerCase(),
    )
  )
    throw new SalesReviewRequired(
      "Terac submission is not eligible for this sales assignment",
    );
  return submission;
}
async function claim(task: Row, from: string, to: string) {
  const { data, error } = await db()
    .from("sales_tasks")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("status", from)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}
/** Separate from builds/fulfillment. Unknown creation/launch outcomes are never replayed. */
export async function processSalesTask(task: Row, terac: Terac) {
  if (["CREATING", "LAUNCHING", "APPROVING"].includes(task.status)) {
    await update("sales_tasks", task.id, {
      status: "NEEDS_REVIEW",
      error: `Interrupted ${task.status}; inspect Terac before recovery. No paid operation was replayed.`,
    });
    return;
  }
  if (task.status === "QUEUED") {
    const values = salesOpportunity(task);
    // Validate the complete contract before creating anything.
    const { teracArguments } = await import("./terac");
    const tool = terac.tools.find(
      (tool) => tool.name === "terac_create_opportunity",
    );
    if (!tool) throw new Error("Terac create tool unavailable");
    teracArguments(tool, values);
    if (!(await claim(task, "QUEUED", "CREATING"))) return;
    const created = await terac.call("terac_create_opportunity", values);
    if (typeof created.id !== "string")
      throw new Error("Terac draft returned no opportunity ID");
    await update("sales_tasks", task.id, {
      terac_opportunity_id: created.id,
      status: "DRAFT",
    });
    task = { ...task, status: "DRAFT", terac_opportunity_id: created.id };
  }
  if (task.status === "DRAFT") {
    const draft = await terac.call("terac_get_opportunity", {
      opportunity_id: task.terac_opportunity_id,
    });
    const quote = opportunityQuote(draft);
    await update("sales_tasks", task.id, { quoted_cost_usd: quote });
    if (quote > Number(task.max_cost_usd))
      throw new Error(
        `Terac quote $${quote} exceeds reserved task budget $${task.max_cost_usd}; draft not launched`,
      );
    if (draft.funding?.affordable !== true)
      throw new Error("Terac balance does not cover this draft; not launched");
    if (String(draft.status).toLowerCase() !== "draft")
      throw new Error(
        "Terac opportunity is not a draft; inspect before proceeding",
      );
    if (!(await claim(task, "DRAFT", "LAUNCHING"))) return;
    const launched = await terac.call("terac_launch_draft_opportunity", {
      opportunity_id: task.terac_opportunity_id,
    });
    if (
      ![
        "active",
        "live",
        "recruiting",
        "published",
        "launched",
        "approved",
      ].includes(String(launched.status).toLowerCase())
    )
      throw new Error(
        "Terac launch acknowledgement has no recognized active status; inspect Terac",
      );
    await update("sales_tasks", task.id, {
      status: "RECRUITING",
      error: null,
      updated_at: new Date().toISOString(),
    });
    await event(
      task.run_id,
      task.business_id,
      "SALES_RECRUITING",
      `Terac opportunity ${task.terac_opportunity_id} launched; quoted cost $${quote}. Waiting for a salesperson, not a completed call.`,
    );
    return;
  }
  if (task.status === "REPORTED") {
    const submission = await verifySalesSubmission(
      terac,
      task,
      task.report.submissionId,
    );
    const status = String(submission.status).toLowerCase();
    if (["approved", "paid", "processing"].includes(status)) {
      await update("sales_tasks", task.id, {
        status: "COMPLETED",
        error: null,
      });
      await event(
        task.run_id,
        task.business_id,
        "SALES_COMPLETED",
        "Terac accepted the call report. Sale confirmation remains the Whop payment webhook.",
      );
    } else if (
      [
        "awaiting_review",
        "awaitingreview",
        "in_review",
        "submitted",
        "pending_review",
      ].includes(status)
    ) {
      if (!(await claim(task, "REPORTED", "APPROVING"))) return;
      await terac.call("terac_approve_submission", {
        submission_id: task.report.submissionId,
      });
      // Re-read approval next tick rather than infer payout from an acknowledgement.
      await update("sales_tasks", task.id, { status: "REPORTED", error: null });
    } else if (["rejected", "cancelled", "screened_out"].includes(status)) {
      throw new SalesReviewRequired(
        `Terac submission is ${status}; inspect the call report`,
      );
    }
  }
  if (task.status === "RECRUITING") {
    const result = await terac.call("terac_get_opportunity", {
      opportunity_id: task.terac_opportunity_id,
    });
    await update("sales_tasks", task.id, {
      provider_status: String(result.status),
      error: null,
    });
    if (
      ["stopped", "cancelled", "closed", "completed", "expired"].includes(
        String(result.status).toLowerCase(),
      )
    )
      throw new SalesReviewRequired(
        "Terac recruitment ended without a call report; inspect the opportunity",
      );
  }
}
export async function salesTick() {
  const { data, error } = await db()
    .from("sales_tasks")
    .select("*")
    .in("status", [
      "QUEUED",
      "CREATING",
      "DRAFT",
      "LAUNCHING",
      "RECRUITING",
      "REPORTED",
      "APPROVING",
    ])
    .lte("next_poll_at", new Date().toISOString())
    .order("created_at")
    .limit(3);
  if (error) throw error;
  if (!data?.length) return;
  const terac = new Terac();
  try {
    await terac.connect();
    for (const task of data) {
      await update("sales_tasks", task.id, {
        next_poll_at: new Date(Date.now() + 30000).toISOString(),
      });
      try {
        await processSalesTask(task, terac);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // Read-only polling can retry. Creation, launch and approval failures need reconciliation.
        const { data: current, error: readError } = await db()
          .from("sales_tasks")
          .select("status")
          .eq("id", task.id)
          .single();
        if (readError) throw readError;
        const review =
          error instanceof SalesReviewRequired ||
          !["RECRUITING", "REPORTED"].includes(current.status);
        await update("sales_tasks", task.id, {
          error: reason,
          ...(review ? { status: "NEEDS_REVIEW" } : {}),
        });
        await event(task.run_id, task.business_id, "SALES_ERROR", reason);
      }
    }
  } finally {
    await terac.close().catch(() => {});
  }
}
