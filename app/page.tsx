"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import demoData from "../data/dashboard-demo.json";
import { summarize, dailyTotals, type Row } from "../lib/dashboard";
import { RevenueChart, PipelineChart } from "./charts";
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n ?? 0);
const label = (s: string) => s?.toLowerCase().replaceAll("_", " ");
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
async function api(path: string, body?: unknown) {
  const r = await fetch(
    `/api/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export default function Dashboard() {
  const [error, setError] = useState(""),
    [runs, setRuns] = useState<Row[]>([]),
    [businesses, setBusinesses] = useState<Row[]>([]),
    [overview, setOverview] = useState<Row>({ orders: [], events: [] }),
    [missing, setMissing] = useState<string[]>([]),
    [demo, setDemo] = useState(false),
    [ready, setReady] = useState(false),
    [selectedRun, setSelectedRun] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [form, setForm] = useState(false),
    [loading, setLoading] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState("");
  const mode = useRef<boolean | null>(null);
  const refresh = useCallback(async () => {
    try {
      const config = await api("config");
      const isDemo = config.missing.length > 0;
      const [r, b, o] = isDemo
        ? [demoData.runs, demoData.businesses, demoData.overview]
        : await Promise.all([api("runs"), api("businesses"), api("overview")]);
      if (mode.current !== isDemo) {
        setSelectedRun("");
        setDetail(null);
      }
      mode.current = isDemo;
      setMissing(config.missing);
      setDemo(isDemo);
      setRuns(r);
      setBusinesses(b);
      setOverview(o);
      setError("");
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!detail || demo) return;
    const timer = setInterval(() => {
      void api(`businesses/${detail.id}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [detail?.id, demo]);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!form && !detail) return;
    dialogTrigger.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, [tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setForm(false);
        setDetail(null);
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      dialogTrigger.current?.focus();
    };
  }, [form, !!detail]);
  function openBusiness(b: Row) {
    if (demo) setDetail(b);
    else
      void api(`businesses/${b.id}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
  }
  const scoped = businesses.filter(
    (b) => !selectedRun || b.run_id === selectedRun,
  );
  const list = scoped
    .filter(
      (b) =>
        (!search || b.name.toLowerCase().includes(search.toLowerCase())) &&
        (filter === "ALL" || b.audits?.[0]?.classification === filter),
    )
    .sort(
      (a, b) =>
        (b.opportunities?.[0]?.priority ?? 0) -
        (a.opportunities?.[0]?.priority ?? 0),
    );
  const events = overview.events.filter(
    (e: Row) => !selectedRun || e.run_id === selectedRun,
  );
  const orders = overview.orders.filter(
    (o: Row) =>
      !selectedRun ||
      scoped.some((b) =>
        b.sites?.some((s: Row) =>
          s.products?.some((p: Row) => p.id === o.product_id),
        ),
      ),
  );
  const summary = summarize(scoped, orders, events);
  const daily = dailyTotals(
    orders,
    events,
    demo ? demoData.asOf : new Date().toISOString(),
  );
  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demo || !ready) return;
    setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      const run = await api("runs", {
        area: f.get("area"),
        radiusMeters: Number(f.get("radiusMeters")),
        types: [String(f.get("types"))],
        maxBusinesses: Number(f.get("maxBusinesses")),
        siteScoreThreshold: 45,
        maxSitesToBuild: Number(f.get("maxSitesToBuild")),
        maxRealEmails: Number(f.get("maxRealEmails")),
        maxSalesTasks: Number(f.get("maxSalesTasks")),
        maxLovableRepairAttempts: 2,
        maxEstimatedRunCostUsd: Number(f.get("maxEstimatedRunCostUsd")),
      });
      setSelectedRun(run.id);
      setForm(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          sidewalk
        </a>
        {demo && <span className="demo-label">Demo data</span>}
        <button disabled={!ready} onClick={() => setForm(true)}>
          New run <span aria-hidden="true">＋</span>
        </button>
      </header>
      <main className="workspace" aria-busy={!ready}>
        <div className="page-heading">
          <h1>Overview</h1>
          <select
            aria-label="Filter by run"
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
          >
            <option value="">All runs</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.params.area} ·{" "}
                {new Date(r.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {!ready ? (
          <p className="loading">Loading dashboard…</p>
        ) : (
          <>
            <section className="metrics" aria-label="Agency metrics">
              {[
                ["Revenue", money(summary.revenue)],
                ["Qualified businesses", summary.qualified],
                ["Sites built", summary.built],
                ["Delivered", summary.delivered],
              ].map(([name, value]) => (
                <div className="metric" key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <div className="charts">
              <section className="chart-section">
                <div className="section-top">
                  <h2>Revenue & spending</h2>
                  <span className="muted">Last 7 days · USD</span>
                </div>
                <RevenueChart data={daily} />
              </section>
              <section className="chart-section">
                <h2>Pipeline</h2>
                <PipelineChart stages={summary.pipeline} />
              </section>
            </div>
            <section className="leads">
              <div className="section-top">
                <h2>
                  Businesses <span className="count">{list.length}</span>
                </h2>
                <input
                  aria-label="Search businesses"
                  placeholder="Search businesses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="filters" aria-label="Website classification">
                {[
                  ["ALL", "All businesses"],
                  ["NO_WEBSITE", "No website"],
                  ["POOR_WEBSITE", "Poor website"],
                  ["GOOD_WEBSITE", "Good website"],
                  ["NEEDS_REVIEW", "Needs review"],
                ].map(([value, name]) => (
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Business",
                        "Website",
                        "Priority",
                        "Sale price",
                        "Build estimate",
                        "Expected value",
                        "Stage",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => {
                      const a = b.audits?.[0],
                        o = b.opportunities?.[0];
                      return (
                        <tr key={b.id}>
                          <td>
                            <button
                              className="business-link"
                              onClick={() => openBusiness(b)}
                            >
                              {b.name}
                            </button>
                            <small>{b.category}</small>
                          </td>
                          <td>
                            <span className="status">
                              {label(a?.classification ?? "pending")}
                            </span>
                            <small>
                              {a?.score == null
                                ? "Not scored"
                                : `${a.score} / 100`}
                            </small>
                          </td>
                          <td>{o?.priority ?? "—"}</td>
                          <td>{money(o?.quoted_price)}</td>
                          <td className="muted">
                            {money(o?.estimated_build_cost)}
                          </td>
                          <td>{money(o?.expected_contribution)}</td>
                          <td>
                            <span className="stage">{label(b.state)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!list.length && (
                  <div className="empty">
                    {businesses.length
                      ? "No matching businesses. Adjust your filters."
                      : "No businesses yet. Create a run to begin."}
                  </div>
                )}
              </div>
              <p className="table-note">
                Build costs and expected values are estimates.
              </p>
            </section>
            <section className="activity">
              <h2>Recent activity</h2>
              <div className="event-list">
                {events.slice(0, 6).map((e: Row) => (
                  <div className="event" key={e.id}>
                    <time dateTime={e.created_at}>
                      {new Date(e.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      <small>{time(e.created_at)}</small>
                    </time>
                    <div>
                      <b>{label(e.action)}</b>
                      <p>{e.reason}</p>
                    </div>
                    {Number(e.cost_usd) > 0 && (
                      <span className="event-cost">{money(e.cost_usd)}</span>
                    )}
                  </div>
                ))}
                {!events.length && <p className="muted">No activity yet.</p>}
              </div>
            </section>
          </>
        )}
      </main>
      {form && (
        <div className="overlay" onClick={() => setForm(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setForm(false)}
            >
              ×
            </button>
            <h2 id="run-title">New run</h2>
            <p>
              Real searches, site builds, sales emails and Terac sales calls.
              Set your limits.
            </p>
            {demo && (
              <div className="notice">
                Connect integrations in .env.local and restart to run real
                searches.<code>{missing.join(" · ")}</code>
              </div>
            )}
            <form onSubmit={start}>
              <label>
                Neighborhood or city
                <input
                  name="area"
                  placeholder="Williamsburg, Brooklyn, NY"
                  required
                  minLength={3}
                />
              </label>
              <div className="form-grid">
                <label>
                  Business category
                  <select name="types">
                    <option value="cafe">Cafes</option>
                    <option value="restaurant">Restaurants</option>
                    <option value="bakery">Bakeries</option>
                    <option value="florist">Florists</option>
                    <option value="hair_salon">Hair salons</option>
                  </select>
                </label>
                <label>
                  Search radius (meters)
                  <input
                    name="radiusMeters"
                    type="number"
                    defaultValue={1300}
                    min={100}
                    max={50000}
                    required
                  />
                </label>
                <label>
                  Businesses to evaluate
                  <input
                    name="maxBusinesses"
                    type="number"
                    defaultValue={20}
                    min={1}
                    max={30}
                    required
                  />
                </label>
                <label>
                  Maximum site builds
                  <input
                    name="maxSitesToBuild"
                    type="number"
                    defaultValue={2}
                    min={1}
                    max={3}
                    required
                  />
                </label>
                <label>
                  Maximum sales emails
                  <input
                    name="maxRealEmails"
                    type="number"
                    defaultValue={2}
                    min={0}
                    max={3}
                    required
                  />
                </label>
                <label>
                  Maximum sales assignments
                  <input
                    name="maxSalesTasks"
                    type="number"
                    defaultValue={2}
                    min={0}
                    max={3}
                    required
                  />
                </label>
                <label>
                  Estimated spend cap (USD)
                  <input
                    name="maxEstimatedRunCostUsd"
                    type="number"
                    defaultValue={75}
                    min={1}
                    max={100}
                    required
                  />
                </label>
              </div>
              <p className="form-note">
                Up to 2 repairs per site. Qualified prospects receive an email
                when a sourced address is available and a Terac call when a
                sourced phone is available.
              </p>
              <button disabled={loading || demo || !ready}>
                {loading ? "Starting…" : "Start run"}
              </button>
            </form>
          </section>
        </div>
      )}
      {detail && (
        <div
          className="overlay inspector-overlay"
          onClick={() => setDetail(null)}
        >
          <section
            className="inspector"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close detail"
              onClick={() => setDetail(null)}
            >
              ×
            </button>
            <h2>{detail.name}</h2>
            <p>
              {detail.category}{" "}
              <span className="stage">{label(detail.state)}</span>
            </p>
            {detail.failure_reason && (
              <div className="notice error">
                {detail.failure_stage}: {detail.failure_reason}
              </div>
            )}
            <h3>Website audit</h3>
            <p>
              {label(detail.audits[0]?.classification)} ·{" "}
              {detail.audits[0]?.score ?? "N/A"}
              {detail.audits[0]?.score != null ? " / 100" : ""}
            </p>
            {detail.website_url && (
              <a href={detail.website_url} target="_blank" rel="noreferrer">
                Original website ↗
              </a>
            )}
            {detail.audits[0]?.screenshot_url && (
              <img
                className="site-image"
                alt="Actual original website audit screenshot"
                src={detail.audits[0].screenshot_url}
              />
            )}
            <ul>
              {detail.audits[0]?.defects?.map((d: string) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <h3>Economics</h3>
            <p className="muted">
              Explicit conversion heuristic, not a trained prediction. Price is
              a hypothesis; production spending is estimated.
            </p>
            <dl>
              {Object.entries(detail.opportunities[0] ?? {})
                .filter(([key]) => !["id", "business_id"].includes(key))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{label(key)}</dt>
                    <dd>
                      {key === "purchase_probability"
                        ? `${(Number(value) * 100).toFixed(1)}%`
                        : Number(value).toFixed(2)}
                    </dd>
                  </div>
                ))}
            </dl>
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
                {detail.products[0]?.storefront_url && (
                  <p>
                    <a
                      href={detail.products[0].storefront_url}
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
                  {task.report && (
                    <>
                      <p>
                        Call outcome: {label(task.report.outcome)} ·
                        self-reported
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
            {detail.orders.map((o: Row) => (
              <div className="notice" key={o.id}>
                <p>
                  {money(o.amount)} · {o.buyer_email} ·{" "}
                  {label(o.delivery_state)}
                  {o.internal ? " · internal verification" : ""}
                </p>
                {o.error && <p className="error">{o.error}</p>}
                {(o.delivery_state === "EMAIL_FAILED" ||
                  (o.delivery_state === "DELIVERED" &&
                    new Date(o.download_expires_at).getTime() <=
                      Date.now())) && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void api(`orders/${o.id}/retry`, {})
                        .then(() =>
                          api(`businesses/${detail.id}`).then(setDetail),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
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
            {detail.events
              .sort((a: Row, b: Row) =>
                a.created_at.localeCompare(b.created_at),
              )
              .map((e: Row) => (
                <div className="detail-event" key={e.id}>
                  <small>
                    {time(e.created_at)} · {label(e.action)}
                  </small>
                  <p>{e.reason}</p>
                </div>
              ))}
          </section>
        </div>
      )}
    </div>
  );
}
