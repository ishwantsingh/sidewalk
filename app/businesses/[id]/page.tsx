"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BusinessWorkspace } from "../../business-workspace";
import type { Row } from "../../../lib/dashboard";

export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Business could not be loaded.");
      setDetail(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function retry(orderId: string) {
    try {
      const response = await fetch(`/api/orders/${orderId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="app">
      <header className="topbar business-topbar">
        <a className="brand" href="/">
          sidewalk
        </a>
        <div className="business-topbar-title">
          <a href="/">← All businesses</a>
          {detail && <h1>{detail.name}</h1>}
        </div>
      </header>
      <main className="workspace business-page">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!detail && !error && <p>Loading business…</p>}
        {detail && (
          <BusinessWorkspace
            detail={detail}
            onRetry={(orderId) => void retry(orderId)}
          />
        )}
      </main>
    </div>
  );
}
