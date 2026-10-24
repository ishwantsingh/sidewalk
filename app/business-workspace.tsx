"use client";
import { useState, type ReactNode } from "react";
import type { Row } from "../lib/dashboard";
import { latestAudit, websiteStatus, websiteStatuses } from "../lib/map";

const label = (value: string = "") => value.toLowerCase().replaceAll("_", " ");
const money = (value: unknown) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(Number(value));
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bw-card">
      <header>
        <h2>{title}</h2>
        {meta}
      </header>
      {children}
    </section>
  );
}
function External({
  href,
  children,
  note,
}: {
  href?: string;
  children: ReactNode;
  note?: string;
}) {
  if (!href) return null;
  return (
    <a className="bw-resource" href={href} target="_blank" rel="noreferrer">
      <span>
        {children}
        {note && <small>{note}</small>}
      </span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function BusinessWorkspace({
  detail: b,
  onRetry,
}: {
  detail: Row;
  onRetry: (id: string) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const audit = latestAudit(b);
  const status = websiteStatuses[websiteStatus(b)];
  const sites: Row[] = b.sites ?? [];
  const site = sites[0];
  const products: Row[] = b.products ?? sites.flatMap((s) => s.products ?? []);
  const tasks: Row[] = b.sales_tasks ?? [];
  const emails: Row[] = b.emails ?? [];
  const orders: Row[] = b.orders ?? [];
  const opportunity = b.opportunities?.[0];
  const facts: Row[] = b.brief?.facts ?? [];
  const address =
    b.address || facts.find((f) => /address/i.test(f.label))?.value;
  const latestTask = tasks[0];
  const attention = b.failure_reason || latestTask?.error;
  const events: Row[] = [...(b.events ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return (
    <section className="business-workspace" role="region" aria-label={b.name}>
      <div className="bw-layout">
        <div className="bw-content">
          <nav className="bw-tabs" aria-label="Business sections">
            {["Overview", "Outreach", "Activity"].map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
                {name === "Activity" && <span>{events.length}</span>}
              </button>
            ))}
            <span className="stage bw-stage">{label(b.state)}</span>
          </nav>
          {attention && (
            <div className="bw-attention">
              <span className="bw-attention-icon">!</span>
              <div>
                <strong>Needs attention</strong>
                <p>{attention}</p>
              </div>
            </div>
          )}
          {tab === "Overview" && (
            <div className="bw-stack">
              <Card
                title="Website overview"
                meta={<span className="bw-muted">Original → Concept</span>}
              >
                <div className="bw-previews">
                  {[
                    {
                      name: "Original website",
                      image: audit?.screenshot_url,
                      note: status.label,
                    },
                    {
                      name: "Sidewalk concept",
                      image: site?.screenshot_url,
                      note: site
                        ? `${label(site.qa_status)} quality check`
                        : "No concept generated",
                    },
                  ].map((preview) => (
                    <div className="bw-preview" key={preview.name}>
                      <div className="bw-browser">
                        <i />
                        <i />
                        <i />
                        <span>{preview.name}</span>
                      </div>
                      {preview.image ? (
                        <img
                          src={preview.image}
                          alt={`${preview.name} screenshot`}
                        />
                      ) : (
                        <div className="bw-preview-empty">
                          {preview.name === "Original website"
                            ? "No audit screenshot"
                            : "Your concept will appear here"}
                        </div>
                      )}
                      <div className="bw-preview-caption">
                        <strong>{preview.name}</strong>
                        <small>{preview.note}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bw-findings">
                  <h3>
                    Audit findings <span>{audit?.defects?.length ?? 0}</span>
                  </h3>
                  {audit?.defects?.length ? (
                    <ul>
                      {audit.defects.map((defect: string) => (
                        <li key={defect}>{defect}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="bw-muted">No issues recorded.</p>
                  )}
                </div>
              </Card>
              <div className="bw-two-up">
                <Card title="Business facts">
                  {facts.length ? (
                    <dl className="bw-facts">
                      {facts.map((fact, i) => (
                        <div key={i}>
                          <dt>{fact.label}</dt>
                          <dd>
                            {fact.value}
                            <a
                              href={fact.source}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source ↗{" "}
                              <span>· {fact.confidence} confidence</span>
                            </a>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="bw-empty">No verified facts yet.</p>
                  )}
                </Card>
                <Card title="Pricing & estimates">
                  <dl className="bw-values">
                    {[
                      ["Sale price", money(opportunity?.quoted_price)],
                      [
                        "Build estimate",
                        money(opportunity?.estimated_build_cost),
                      ],
                      ["Research cost", money(opportunity?.research_cost)],
                      [
                        "Sales budget",
                        money(opportunity?.estimated_sales_cost),
                      ],
                      [
                        "Priority",
                        opportunity?.priority == null
                          ? "—"
                          : Number(opportunity.priority).toFixed(1),
                      ],
                    ].map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="bw-footnote">
                    Costs are estimates. Sale price is the proposed one-time
                    source-code offer.
                  </p>
                  <details className="bw-disclosure">
                    <summary>All estimates</summary>
                    <dl className="bw-values">
                      {Object.entries(opportunity ?? {})
                        .filter(([k]) =>
                          [
                            "website_opportunity",
                            "quoted_price",
                            "estimated_build_cost",
                            "research_cost",
                            "estimated_sales_cost",
                            "priority",
                          ].includes(k),
                        )
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt>{label(key)}</dt>
                            <dd>
                              {typeof value === "number"
                                ? value.toFixed(2)
                                : String(value)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </details>
                </Card>
              </div>
              {sites.length > 0 && (
                <Card title="Build & source files">
                  {sites.map((s) => (
                    <div className="bw-build" key={s.id}>
                      <span className="stage">{label(s.qa_status)}</span>
                      <p>
                        {s.zip_path
                          ? "Source archive built and verified"
                          : "Source archive not exported"}
                      </p>
                      <details className="bw-disclosure">
                        <summary>Build details</summary>
                        <dl className="bw-values">
                          {[
                            ["Project", s.lovable_project_id],
                            ["Source archive", s.zip_path],
                            ["SHA-256", s.checksum],
                          ].map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value || "Pending"}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
          {tab === "Outreach" && (
            <div className="bw-stack">
              <Card
                title="Sales emails"
                meta={
                  <span className="bw-muted">{emails.length} recorded</span>
                }
              >
                {emails.length ? (
                  emails.map((email) => (
                    <article className="bw-message" key={email.id}>
                      <div className="bw-message-meta">
                        <span className="stage">{label(email.status)}</span>
                        <span>{email.address}</span>
                        {email.sent_at && <time>{date(email.sent_at)}</time>}
                      </div>
                      <h3>{email.subject || "Sales email"}</h3>
                      <p className="bw-email-body">
                        {email.body || "No email content recorded."}
                      </p>
                      {email.error && <p className="error">{email.error}</p>}
                      {email.provider_message_id && (
                        <small>
                          Provider reference · {email.provider_message_id}
                        </small>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="bw-empty">No sales emails yet.</p>
                )}
              </Card>
              <Card title="Salesperson assignments">
                {tasks.length ? (
                  tasks.map((task) => (
                    <article className="bw-message" key={task.id}>
                      <div className="bw-message-meta">
                        <span className="stage">{label(task.status)}</span>
                        <span>Terac</span>
                        <span>
                          Budget {money(task.max_cost_usd)}
                          {task.quoted_cost_usd != null &&
                            ` · Quote ${money(task.quoted_cost_usd)}`}
                        </span>
                      </div>
                      {task.error && (
                        <div className="bw-inline-alert">{task.error}</div>
                      )}
                      {task.brief && (
                        <>
                          <h3>The offer</h3>
                          <p>{task.brief.offer}</p>
                          <details className="bw-disclosure" open>
                            <summary>Salesperson instructions</summary>
                            <p>{task.brief.instructions}</p>
                          </details>
                          {task.brief.salesEmail && (
                            <details className="bw-disclosure">
                              <summary>
                                Email context shared with salesperson
                              </summary>
                              <h3>{task.brief.salesEmail.subject}</h3>
                              <p className="bw-email-body">
                                {task.brief.salesEmail.body}
                              </p>
                            </details>
                          )}
                        </>
                      )}
                      {task.report && (
                        <div className="bw-report">
                          <h3>Call report · {label(task.report.outcome)}</h3>
                          <p>{task.report.notes}</p>
                          <small>
                            Self-reported. Payment is verified separately
                            through Whop.
                          </small>
                        </div>
                      )}
                      {task.terac_opportunity_id && (
                        <small>
                          Assignment reference · {task.terac_opportunity_id}
                        </small>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="bw-empty">No salesperson assigned yet.</p>
                )}
              </Card>
              <Card title="Orders & delivery">
                {orders.length ? (
                  orders.map((order) => (
                    <div className="bw-message" key={order.id}>
                      <div className="bw-message-meta">
                        <strong>{money(order.amount)}</strong>
                        <span>{order.buyer_email}</span>
                        <span className="stage">
                          {label(order.delivery_state)}
                        </span>
                        {order.internal && <small>Internal verification</small>}
                      </div>
                      {order.error && <p className="error">{order.error}</p>}
                      {(order.delivery_state === "EMAIL_FAILED" ||
                        (order.delivery_state === "DELIVERED" &&
                          new Date(order.download_expires_at).getTime() <=
                            Date.now())) && (
                        <button onClick={() => onRetry(order.id)}>
                          {order.delivery_state === "DELIVERED"
                            ? "Renew download link"
                            : "Retry ZIP delivery"}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="bw-empty">No purchases recorded.</p>
                )}
              </Card>
            </div>
          )}
          {tab === "Activity" && (
            <Card
              title="Business activity"
              meta={<span className="bw-muted">Most recent first</span>}
            >
              <div className="bw-timeline">
                {events.length ? (
                  events.map((event) => (
                    <div key={event.id}>
                      <time>{date(event.created_at)}</time>
                      <div>
                        <strong>{label(event.action)}</strong>
                        <p>{event.reason}</p>
                        {Number(event.cost_usd) > 0 && (
                          <small>
                            Estimated cost · {money(event.cost_usd)}
                          </small>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="bw-empty">No activity recorded.</p>
                )}
              </div>
              <details className="bw-disclosure">
                <summary>Complete business record</summary>
                <pre className="business-record">
                  {JSON.stringify(b, null, 2)}
                </pre>
              </details>
            </Card>
          )}
        </div>
        <aside className="bw-sidebar">
          <Card title="Links & resources">
            <div className="bw-resources">
              <External href={b.website_url} note="Current business website">
                Original website
              </External>
              {sites.map((s) => (
                <div key={s.id}>
                  <External
                    href={s.preview_url}
                    note="Published unofficial concept"
                  >
                    Website concept
                  </External>
                  <External
                    href={
                      s.lovable_project_id
                        ? `https://lovable.dev/projects/${encodeURIComponent(s.lovable_project_id)}`
                        : undefined
                    }
                    note="Open project editor"
                  >
                    Lovable project
                  </External>
                </div>
              ))}
              {products.map((p) => (
                <div key={p.id}>
                  <External href={p.storefront_url} note="Product storefront">
                    Whop listing
                  </External>
                  <External href={p.purchase_url} note="Purchase source files">
                    Whop checkout
                  </External>
                </div>
              ))}
              {!products.length && (
                <External
                  href={latestTask?.brief?.checkout}
                  note="Purchase source files"
                >
                  Whop checkout
                </External>
              )}
              {!b.website_url && !site && !products.length && (
                <p className="bw-empty">
                  Project links will appear when available.
                </p>
              )}
            </div>
          </Card>
          <Card title="Contact">
            <div className="bw-contact">
              <span>Email</span>
              {b.email ? (
                <a href={`mailto:${b.email}`}>{b.email}</a>
              ) : (
                <p>Not sourced</p>
              )}
              {b.email_source && (
                <a
                  className="bw-source"
                  href={b.email_source}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source ↗
                </a>
              )}
              <span>Phone</span>
              {b.phone ? (
                <a href={`tel:${b.phone}`}>{b.phone}</a>
              ) : (
                <p>Not sourced</p>
              )}
              {b.phone_source && (
                <a
                  className="bw-source"
                  href={b.phone_source}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source ↗
                </a>
              )}
              {address && (
                <>
                  <span>Address</span>
                  <p>{address}</p>
                </>
              )}
            </div>
          </Card>
          <p className="bw-sidebar-note">
            Business records update automatically.
          </p>
        </aside>
      </div>
    </section>
  );
}
