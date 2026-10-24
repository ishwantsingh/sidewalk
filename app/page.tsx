"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { summarize, dailyTotals, type Row } from "../lib/dashboard";
import { BusinessMap } from "./business-map";
import { BusinessDetails } from "./business-details";
import { DEFAULT_AREA, latestAudit } from "../lib/map";
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
    [ready, setReady] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [form, setForm] = useState(false),
    [buildTarget, setBuildTarget] = useState<Row | null>(null),
    [loading, setLoading] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState(""),
    [mapArea] = useState(DEFAULT_AREA);
  const refresh = useCallback(async () => {
    try {
      const config = await api("config");
      setMissing(config.missing);
      const [r, b, o] = await Promise.all([
        api("runs"),
        api("businesses"),
        api("overview"),
      ]);
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
    if (!detail) return;
    const timer = setInterval(() => {
      void api(`businesses/${detail.id}`)
        .then((value) => {
          if (activeBusiness.current === value.id) setDetail(value);
        })
        .catch((e) => setError(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [detail?.id]);
  useEffect(() => {
    if (!detail) return;
    const panel = document.querySelector<HTMLElement>(
      ".map-layout > .inspector",
    );
    panel?.focus({ preventScroll: true });
    const workspace = document.querySelector<HTMLElement>(".map-workspace");
    if (workspace && workspace.getBoundingClientRect().bottom < 100)
      workspace.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [detail?.id]);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!form) return;
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
  }, [form]);
  const activeBusiness = useRef<string | null>(null);
  const businessTrigger = useRef<HTMLElement | null>(null);
  function closeBusiness() {
    activeBusiness.current = null;
    setDetail(null);
    if (businessTrigger.current?.isConnected) businessTrigger.current.focus();
    else
      document.querySelector<HTMLButtonElement>(".map-legend button")?.focus();
  }
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !form) closeBusiness();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [form]);
  function openBusiness(b: Row) {
    activeBusiness.current = b.id;
    businessTrigger.current = document.activeElement as HTMLElement;
    void api(`businesses/${b.id}`)
      .then((value) => {
        if (activeBusiness.current === b.id) setDetail(value);
      })
      .catch((e) => setError(e.message));
  }
  const scoped = businesses;
  const list = scoped
    .filter(
      (b) =>
        (!search || b.name.toLowerCase().includes(search.toLowerCase())) &&
        (filter === "ALL" || latestAudit(b)?.classification === filter),
    )
    .sort(
      (a, b) =>
        (b.opportunities?.[0]?.priority ?? 0) -
        (a.opportunities?.[0]?.priority ?? 0),
    );
  const events = overview.events;
  const orders = overview.orders;
  const summary = summarize(scoped, orders, events);
  const daily = dailyTotals(orders, events, new Date().toISOString());
  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (missing.length || !ready) return;
    setLoading(true);
    const f = new FormData(e.currentTarget);
    try {
      const run = await api("runs", {
        ...(buildTarget ? { selectedBusinessId: buildTarget.id } : {}),
        area: f.get("area"),
        radiusMeters: buildTarget ? 1300 : Number(f.get("radiusMeters")),
        types: buildTarget
          ? runs.find((run) => run.id === buildTarget.run_id)?.params.types
          : [String(f.get("types"))],
        maxBusinesses: buildTarget ? 1 : Number(f.get("maxBusinesses")),
        maxSitesToBuild: Number(f.get("maxSitesToBuild")),
        maxRealEmails: Number(f.get("maxRealEmails")),
        maxSalesTasks: Number(f.get("maxSalesTasks")),
        requireEmailAndPhone: f.get("requireEmailAndPhone") === "on",
        maxLovableRepairAttempts: 2,
        maxEstimatedRunCostUsd: Number(f.get("maxEstimatedRunCostUsd")),
      });
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
        <button
          disabled={!ready}
          onClick={() => {
            setBuildTarget(null);
            setForm(true);
          }}
        >
          New run <span aria-hidden="true">＋</span>
        </button>
      </header>
      <main className="workspace" aria-busy={!ready}>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {!ready ? (
          <p className="loading">Loading dashboard…</p>
        ) : (
          <>
            <BusinessMap
              businesses={list}
              selectedId={detail?.id}
              onSelect={openBusiness}
            >
              {detail && (
                <BusinessDetails
                  detail={detail}
                  onClose={closeBusiness}
                  onBuild={(business) => {
                    setBuildTarget(business);
                    closeBusiness();
                    setForm(true);
                  }}
                  onRetry={(id) =>
                    void api(`orders/${id}/retry`, {})
                      .then(() => api(`businesses/${detail.id}`))
                      .then((value) => {
                        if (activeBusiness.current === value.id)
                          setDetail(value);
                      })
                      .catch((e) => setError(e.message))
                  }
                />
              )}
            </BusinessMap>
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
                        "Stage",
                      ].map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => {
                      const a = latestAudit(b),
                        o = b.opportunities?.[0];
                      return (
                        <tr key={b.id}>
                          <td>
                            <a
                              className="business-link"
                              href={`/businesses/${b.id}`}
                            >
                              {b.name}
                            </a>
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
              <p className="table-note">Build costs are estimates.</p>
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
            <h2 id="run-title">
              {buildTarget ? "Build selected business" : "New run"}
            </h2>
            {buildTarget && (
              <div className="notice">
                <strong>{buildTarget.name}</strong>
                <p>
                  Explicit concept-build selection. Existing research and the
                  actual audit score are preserved; discovery is skipped.
                </p>
              </div>
            )}
            <p>
              Real searches, site builds, sales emails and Terac sales calls.
              Set your limits.
            </p>
            {missing.length > 0 && (
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
                  readOnly
                  defaultValue={mapArea}
                  placeholder="Williamsburg, Brooklyn, NY"
                  required
                  minLength={3}
                />
              </label>
              <div className="form-grid">
                {!buildTarget && (
                  <>
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
                  </>
                )}
                <label>
                  Maximum site builds
                  <input
                    name="maxSitesToBuild"
                    type="number"
                    readOnly={!!buildTarget}
                    defaultValue={1}
                    min={1}
                    max={buildTarget ? 1 : 3}
                    required
                  />
                </label>
                <label>
                  Maximum sales emails
                  <input
                    name="maxRealEmails"
                    type="number"
                    defaultValue={1}
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
                    defaultValue={1}
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
                    step="0.01"
                    defaultValue={75}
                    min={1}
                    max={250}
                    required
                  />
                </label>
              </div>
              <label className="run-contact-filter">
                <input type="checkbox" name="requireEmailAndPhone" />
                <span>
                  Require both a sourced email and phone before building
                </span>
              </label>
              <p className="form-note">
                Prioritizes businesses with no website, then weak websites, with
                a sourced email or phone. Ranking is based on need and contact
                availability. Up to 2 repairs per site. Qualified prospects
                receive an email when a sourced address is available and a Terac
                call when a sourced phone is available.
              </p>
              <button disabled={loading || missing.length > 0 || !ready}>
                {loading ? "Starting…" : "Start run"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
