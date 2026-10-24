"use client";
import { latestAudit, websiteStatus, websiteStatuses } from "../lib/map";
import type { Row } from "../lib/dashboard";
const label = (s: string) => s?.toLowerCase().replaceAll("_", " ");
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n ?? 0,
  );
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function BusinessDetails({
  detail,
  onClose,
  onRetry,
  onBuild,
}: {
  detail: Row;
  onClose?: () => void;
  onRetry: (id: string) => void;
  onBuild?: (business: Row) => void;
}) {
  const audit = latestAudit(detail);
  return (
    <section
      className="inspector"
      role="region"
      aria-label={detail.name}
      tabIndex={-1}
    >
      {onClose && (
        <button className="close" aria-label="Close detail" onClick={onClose}>
          ×
        </button>
      )}
      <h2>{detail.name}</h2>
      {onClose && <a href={`/businesses/${detail.id}`}>Show all details ↗</a>}
      <p>
        {detail.category} <span className="stage">{label(detail.state)}</span>
      </p>
      {detail.failure_reason && (
        <div className="notice error">
          {detail.failure_stage}: {detail.failure_reason}
        </div>
      )}
      <h3>Website audit</h3>
      {detail.address && <p>{detail.address}</p>}
      <p>
        {websiteStatuses[websiteStatus(detail)].label} · {audit?.score ?? "N/A"}
        {audit?.score != null ? " / 100" : ""}
      </p>
      {detail.website_url && (
        <a href={detail.website_url} target="_blank" rel="noreferrer">
          Original website ↗
        </a>
      )}
      {audit?.screenshot_url && (
        <img
          className="site-image"
          alt="Actual original website audit screenshot"
          src={audit.screenshot_url}
        />
      )}
      <ul>
        {audit?.defects?.map((d: string) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h3>Price and cost estimates</h3>
      <p className="muted">
        Costs are estimates and do not exclude businesses from selection.
        Priority goes to businesses with no website, then weak websites.
      </p>
      <dl>
        {Object.entries(detail.opportunities[0] ?? {})
          .filter(([key]) =>
            [
              "website_opportunity",
              "quoted_price",
              "estimated_build_cost",
              "research_cost",
              "estimated_sales_cost",
              "priority",
            ].includes(key),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd>{Number(value).toFixed(2)}</dd>
            </div>
          ))}
      </dl>
      {onBuild && !detail.sites?.length && audit && (
        <div className="notice">
          <p>
            Explicit selection preserves this business’s real audit score. A
            sourced email or phone and business identity are checked before
            building.
          </p>
          <button className="secondary" onClick={() => onBuild(detail)}>
            Build a concept for this business
          </button>
        </div>
      )}
      <h3>Finished website</h3>
      {detail.sites[0] ? (
        <>
          <p>
            QA: {detail.sites[0].qa_status} · ZIP:{" "}
            {detail.sites[0].zip_path ? "Build verified" : "Not exported"}
          </p>
          {detail.sites[0].screenshot_url && (
            <img
              className="site-image"
              alt="Actual generated site screenshot"
              src={detail.sites[0].screenshot_url}
            />
          )}
          {detail.sites[0].preview_url && (
            <a
              href={detail.sites[0].preview_url}
              target="_blank"
              rel="noreferrer"
            >
              Open unofficial concept ↗
            </a>
          )}
          {detail.sites[0].lovable_project_id && (
            <p>
              <a
                href={`https://lovable.dev/projects/${encodeURIComponent(detail.sites[0].lovable_project_id)}`}
                target="_blank"
                rel="noreferrer"
              >
                Lovable project ↗
              </a>
            </p>
          )}
          {detail.products?.[0]?.storefront_url && (
            <p>
              <a
                href={detail.products?.[0].storefront_url}
                target="_blank"
                rel="noreferrer"
              >
                Exact Whop product ↗
              </a>
            </p>
          )}
          <small className="checksum">
            SHA-256: {detail.sites[0].checksum ?? "Pending export"}
          </small>
        </>
      ) : (
        <p className="muted">No site generated.</p>
      )}
      <h3>Sales & delivery</h3>
      <p>
        {detail.phone ?? "No sourced business phone"}
        <small>{detail.phone_source}</small>
      </p>
      <p>
        {detail.email ?? "No sourced business email"}
        <small>{detail.email_source}</small>
      </p>
      {detail.emails?.map((email: Row) => (
        <div className="notice" key={email.id}>
          <p>
            Sales email: {label(email.status)} · {email.address}
          </p>
          {email.provider_message_id && (
            <small>Provider: {email.provider_message_id}</small>
          )}
          {email.error && <p className="error">{email.error}</p>}
          {email.subject && (
            <details>
              <summary>{email.subject}</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{email.body}</p>
            </details>
          )}
        </div>
      ))}
      {detail.sales_tasks?.length ? (
        detail.sales_tasks.map((task: Row) => (
          <div className="notice" key={task.id}>
            <p>
              Terac: {label(task.status)}
              {task.terac_opportunity_id
                ? ` · ${task.terac_opportunity_id}`
                : ""}
            </p>
            <p>
              Sales budget: {money(Number(task.max_cost_usd))}
              {task.quoted_cost_usd != null
                ? ` · Quote: ${money(Number(task.quoted_cost_usd))}`
                : ""}
            </p>
            {task.error && <p className="error">{task.error}</p>}
            {task.brief && (
              <details open>
                <summary>Salesperson brief</summary>
                <p>{task.brief.offer}</p>
                <p>{task.brief.instructions}</p>
                {task.brief.liveWebsite && (
                  <p>
                    <a
                      href={task.brief.liveWebsite}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website concept ↗
                    </a>
                  </p>
                )}
                {task.brief.storefront && (
                  <p>
                    <a
                      href={task.brief.storefront}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Whop listing ↗
                    </a>
                  </p>
                )}
                {task.brief.checkout && (
                  <p>
                    <a
                      href={task.brief.checkout}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Whop checkout ↗
                    </a>
                  </p>
                )}
                {task.brief.salesEmail?.subject && (
                  <>
                    <h4>{task.brief.salesEmail.subject}</h4>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {task.brief.salesEmail.body}
                    </p>
                  </>
                )}
              </details>
            )}
            {task.report && (
              <>
                <p>
                  Call outcome: {label(task.report.outcome)} · self-reported
                </p>
                <p>{task.report.notes}</p>
              </>
            )}
            <small>Only a verified Whop payment confirms a sale.</small>
          </div>
        ))
      ) : (
        <p>No salesperson assigned.</p>
      )}
      {(detail.orders ?? []).map((o: Row) => (
        <div className="notice" key={o.id}>
          <p>
            {money(o.amount)} · {o.buyer_email} · {label(o.delivery_state)}
            {o.internal ? " · internal verification" : ""}
          </p>
          {o.error && <p className="error">{o.error}</p>}
          {(o.delivery_state === "EMAIL_FAILED" ||
            (o.delivery_state === "DELIVERED" &&
              new Date(o.download_expires_at).getTime() <= Date.now())) && (
            <button className="secondary" onClick={() => onRetry(o.id)}>
              {o.delivery_state === "DELIVERED"
                ? "Renew download link"
                : "Retry ZIP delivery"}
            </button>
          )}
        </div>
      ))}
      <h3>Verified facts</h3>
      {detail.brief?.facts.map((f: Row, i: number) => (
        <p key={i}>
          <b>{f.label}:</b> {f.value}
          <small>
            <a href={f.source} target="_blank" rel="noreferrer">
              Source ↗
            </a>{" "}
            · {f.confidence} confidence
          </small>
        </p>
      ))}
      <h3>Timeline</h3>
      {[...(detail.events ?? [])]
        .sort((a: Row, b: Row) => a.created_at.localeCompare(b.created_at))
        .map((e: Row) => (
          <div className="detail-event" key={e.id}>
            <small>
              {time(e.created_at)} · {label(e.action)}
            </small>
            <p>{e.reason}</p>
          </div>
        ))}
      {!onClose && (
        <details>
          <summary>Complete business record</summary>
          <pre className="business-record">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
