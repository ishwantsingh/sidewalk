"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Row } from "../../../lib/dashboard";
function SalesBrief() {
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const [task, setTask] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [done, setDone] = useState(false);
  const endpoint = `/api/sales/${id}?signature=${encodeURIComponent(query.get("signature") ?? "")}`;
  useEffect(() => {
    fetch(endpoint)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setTask(data);
      })
      .catch((e) => setError(e.message));
  }, [endpoint]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: data.get("submissionId"),
          outcome: data.get("outcome"),
          notes: data.get("notes"),
          calledAt: new Date().toISOString(),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const b = task?.brief;
  return (
    <main className="sales-brief">
      <a className="brand" href="/">
        sidewalk
      </a>
      <h1>Sales assignment</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!task && !error && <p>Loading your brief…</p>}
      {b && (
        <>
          <h2>{b.business}</h2>
          <p>
            {b.category} · {task.status.toLowerCase().replaceAll("_", " ")}
          </p>
          <p>
            <a href={`tel:${b.phone}`}>{b.phone}</a> ·{" "}
            <a href={b.phoneSource} target="_blank" rel="noreferrer">
              Phone source ↗
            </a>
          </p>
          {b.email && <p>Business email: {b.email}</p>}
          <p>
            <a href={b.liveWebsite} target="_blank" rel="noreferrer">
              View the completed website ↗
            </a>
          </p>
          <p>
            <a href={b.storefront} target="_blank" rel="noreferrer">
              Whop product page ↗
            </a>{" "}
            ·{" "}
            <a href={b.checkout} target="_blank" rel="noreferrer">
              Exact checkout ↗
            </a>
          </p>
          <h3>The offer · ${b.priceUsd}</h3>
          <p>{b.offer}</p>
          <h3>Sales email context</h3>
          <p>Status: {b.salesEmail?.status ?? "No email context"}</p>
          {b.salesEmail?.address && <p>To: {b.salesEmail.address}</p>}
          {b.salesEmail?.sentAt && (
            <p>Provider accepted at: {b.salesEmail.sentAt}</p>
          )}
          {b.salesEmail?.subject && (
            <>
              <p>
                <b>Subject:</b> {b.salesEmail.subject}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{b.salesEmail.body}</p>
            </>
          )}
          {b.salesEmail?.error && (
            <p>
              Email attempt failed: {b.salesEmail.error}. Explain the offer
              directly.
            </p>
          )}
          <h3>Call instructions</h3>
          <p>{b.instructions}</p>
          <h3>Why this business</h3>
          <p>{b.websiteFindings.classification.replaceAll("_", " ")}</p>
          <ul>
            {b.websiteFindings.defects.map((d: string, i: number) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <h3>Verified business context</h3>
          {b.facts.map((f: Row, i: number) => (
            <p key={i}>
              <b>{f.label}:</b> {f.value} ·{" "}
              <a href={f.source} target="_blank" rel="noreferrer">
                Source ↗
              </a>
            </p>
          ))}
          {done || task.report ? (
            <div role="status" className="notice">
              Call report recorded. Return to Terac and mark the task complete
              so it can be reviewed and paid. Purchases are confirmed separately
              through Whop.
            </div>
          ) : task.status === "RECRUITING" ? (
            <form onSubmit={submit}>
              <h3>Report your call</h3>
              <label>
                Terac submission ID
                <input
                  name="submissionId"
                  defaultValue={
                    query.get("submissionId") ??
                    query.get("teracSubmissionId") ??
                    ""
                  }
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Outcome
                <select name="outcome">
                  <option value="INTERESTED">Interested</option>
                  <option value="DECLINED">Declined</option>
                  <option value="NO_ANSWER">No answer</option>
                  <option value="WRONG_NUMBER">Wrong number</option>
                  <option value="DO_NOT_CALL">
                    Requested no further calls
                  </option>
                  <option value="PURCHASE_REPORTED">
                    Owner says they purchased (unverified)
                  </option>
                </select>
              </label>
              <label>
                Call notes
                <textarea
                  name="notes"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  placeholder="Who you reached, their reaction, objections, and whether you shared the Whop link."
                />
              </label>
              <button disabled={saving}>
                {saving ? "Saving…" : "Submit call report"}
              </button>
            </form>
          ) : (
            <p>This assignment is not currently accepting reports.</p>
          )}
        </>
      )}
    </main>
  );
}
export default function SalesPage() {
  return (
    <Suspense fallback={<p>Loading sales brief…</p>}>
      <SalesBrief />
    </Suspense>
  );
}
