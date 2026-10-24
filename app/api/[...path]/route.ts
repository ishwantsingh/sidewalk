import { NextResponse } from "next/server";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { z } from "zod";
import {
  env,
  missingConfig,
  configIssues,
  runSchema,
} from "../../../lib/config";
import { verifySignature } from "../../../lib/mail";
import { validSalesSignature } from "../../../lib/sales-access";
import {
  callReportSchema,
  verifySalesSubmission,
  SalesReviewRequired,
} from "../../../lib/sales";
import { Terac } from "../../../lib/terac";
import { sameOrigin } from "../../../lib/origin";
import { db, insert, one, rows, update } from "../../../lib/db";

import { acceptPayment, hashToken } from "../../../lib/fulfillment";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handler(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  const route = path.join("/"),
    method = request.method;
  try {
    if (route === "webhooks/whop" && method === "POST") {
      const raw = await request.text();
      let event;
      try {
        event = unwrapWebhook(raw, {
          headers: Object.fromEntries(request.headers),
          key: env("WHOP_WEBHOOK_SECRET"),
        });
      } catch {
        return response({ error: "Invalid webhook signature" }, 401);
      }
      const parsed = z
        .object({
          id: z.string(),
          type: z.string(),
          data: z.object({ id: z.string() }),
        })
        .parse(event);
      if (parsed.type === "payment.succeeded")
        await acceptPayment(parsed.id, parsed.data.id);
      return response({ received: true });
    }
    if (path[0] === "download" && method === "GET") {
      const token = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(path[1]);
      const { data: order, error } = await db()
        .from("orders")
        .select("*")
        .eq("download_token_hash", hashToken(token))
        .gt("download_expires_at", new Date().toISOString())
        .single();
      if (error || !order)
        return response(
          {
            error:
              "Download link is invalid or expired. Contact the seller for recovery.",
          },
          410,
        );
      const product = await one("products", order.product_id);
      const site = await one("sites", product.site_id);
      const { data, error: signError } = await db()
        .storage.from(env("SUPABASE_ZIP_BUCKET"))
        .createSignedUrl(site.zip_path, 60, { download: true });
      if (signError) throw signError;
      return NextResponse.redirect(data.signedUrl, 303);
    }
    if (path[0] === "opt-out" && ["GET", "POST"].includes(method)) {
      const id = z.uuid().parse(path[1]);
      const signature =
        new URL(request.url).searchParams.get("signature") ?? "";
      if (!verifySignature(`optout:${id}`, signature))
        return response({ error: "Invalid opt-out link" }, 403);
      await update("emails", id, { opted_out: true });
      return new NextResponse(
        "You have been opted out of future Sidewalk AI offers.",
        {
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (!["GET", "HEAD"].includes(method) && !sameOrigin(request))
      return response({ error: "Forbidden origin" }, 403);
    if (
      path[0] === "sales" &&
      path.length === 2 &&
      ["GET", "POST"].includes(method)
    ) {
      const id = z.uuid().parse(path[1]);
      const signature =
        new URL(request.url).searchParams.get("signature") ?? "";
      if (!validSalesSignature(id, signature))
        return response({ error: "Invalid sales brief link" }, 403);
      const task = await one("sales_tasks", id);
      if (method === "GET")
        return response({
          id: task.id,
          brief: task.brief,
          status: task.status,
          report: task.report,
        });
      if (task.status !== "RECRUITING")
        return response(
          { error: "This task is not accepting a new report" },
          409,
        );
      const report = callReportSchema.parse(await request.json());
      if (
        new Date(report.calledAt).getTime() <
        new Date(task.created_at).getTime()
      )
        return response({ error: "Call predates the assignment" }, 400);
      const terac = new Terac();
      try {
        await terac.connect();
        await verifySalesSubmission(terac, task, report.submissionId);
      } finally {
        await terac.close().catch(() => {});
      }
      if (report.outcome === "DO_NOT_CALL") {
        const { error } = await db()
          .from("sales_suppressions")
          .upsert({ phone: task.brief.phone.replace(/\D/g, "") });
        if (error) throw error;
      }
      const { data, error } = await db()
        .from("sales_tasks")
        .update({
          report,
          status: "REPORTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "RECRUITING")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return response({ error: "A report has already been submitted" }, 409);
      return response({ recorded: true });
    }
    if (route === "config" && method === "GET")
      return response({ missing: missingConfig(), issues: configIssues() });
    if (route === "runs" && method === "POST") {
      const missing = missingConfig();
      if (missing.length)
        return response(
          { error: `Missing or invalid configuration: ${missing.join(", ")}` },
          503,
        );
      const params = runSchema.parse(await request.json());
      try {
        const run = await insert("runs", { params });
        return response(run, 201);
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          return response(
            { error: "A run is already queued or running." },
            409,
          );
        throw error;
      }
    }
    if (route === "runs" && method === "GET") {
      const { data, error } = await db()
        .from("runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return response(data);
    }
    if (path[0] === "runs" && path[1] && method === "GET") {
      const id = z.uuid().parse(path[1]);
      return response({
        ...(await one("runs", id)),
        events: await rows("events", "run_id", id),
      });
    }
    if (route === "businesses" && method === "GET") {
      const run = new URL(request.url).searchParams.get("run");
      const { data, error } = await db()
        .from("businesses")
        .select(
          "*,audits(*),opportunities(*),sites(*,products(*)),emails(*),sales_tasks(*),events(action,created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return response(run ? data.filter((b) => b.run_id === run) : data);
    }
    if (path[0] === "businesses" && path[1] && method === "GET") {
      const id = z.uuid().parse(path[1]);
      const business = await one("businesses", id);
      const sites = await rows("sites", "business_id", id);
      const products = sites[0]
        ? await rows("products", "site_id", sites[0].id)
        : [];
      const orders = products[0]
        ? await rows("orders", "product_id", products[0].id)
        : [];
      return response({
        ...business,
        audits: await rows("audits", "business_id", id),
        opportunities: await rows("opportunities", "business_id", id),
        sites,
        products,
        emails: await rows("emails", "business_id", id),
        sales_tasks: await rows("sales_tasks", "business_id", id),
        orders,
        events: await rows("events", "business_id", id),
      });
    }
    if (route === "overview" && method === "GET") {
      const [orders, events] = await Promise.all([
        rows("orders"),
        rows("events"),
      ]);
      return response({
        orders,
        events: events
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 200),
      });
    }
    if (path[0] === "orders" && path[2] === "retry" && method === "POST") {
      const id = z.uuid().parse(path[1]);
      const order = await one("orders", id);
      const expired =
        order.download_expires_at &&
        new Date(order.download_expires_at).getTime() <= Date.now();
      if (
        order.delivery_state !== "EMAIL_FAILED" &&
        !(order.delivery_state === "DELIVERED" && expired)
      )
        return response(
          { error: "Only failed or expired deliveries can be retried." },
          409,
        );
      await update("orders", id, {
        delivery_state: "PENDING",
        delivery_attempts: 0,
        next_attempt_at: new Date().toISOString(),
      });
      return response({ queued: true });
    }
    return response({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof SalesReviewRequired)
      return response({ error: error.message }, 403);
    if (error instanceof z.ZodError)
      return response({ error: z.prettifyError(error) }, 400);
    console.error("API request failed", error);
    return response(
      { error: error instanceof Error ? error.message : "Request failed" },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
