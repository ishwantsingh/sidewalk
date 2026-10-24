export type Row = Record<string, any>;
export function summarize(businesses: Row[], orders: Row[], events: Row[]) {
  const qualified = businesses.filter(
    (b) =>
      (b.opportunities?.[0]?.priority ?? 0) > 0 &&
      !["REJECTED", "NO_CONTACT"].includes(b.state),
  ).length;
  const built = businesses.filter((b) =>
    b.sites?.some((s: Row) => s.qa_status === "PASSED" && s.zip_path),
  ).length;
  const listed = businesses.filter((b) =>
    b.sites?.some((s: Row) => s.products?.some((p: Row) => p.verified)),
  ).length;
  const emailed = businesses.filter((b) =>
    b.emails?.some((e: Row) => e.status === "SENT"),
  ).length;
  const delivered = orders.filter(
    (o) => o.delivery_state === "DELIVERED",
  ).length;
  return {
    qualified,
    built,
    delivered,
    revenue: orders
      .filter((o) => !o.internal)
      .reduce((s, o) => s + Number(o.amount), 0),
    spending: events.reduce((s, e) => s + Number(e.cost_usd), 0),
    pipeline: [
      { label: "Discovered", value: businesses.length },
      { label: "Qualified", value: qualified },
      { label: "Built", value: built },
      { label: "Listed", value: listed },
      { label: "Contacted", value: emailed },
      { label: "Delivered", value: delivered },
    ],
  };
}
export function dailyTotals(orders: Row[], events: Row[], asOf: string) {
  const end = new Date(asOf);
  end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - 6 + i);
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      revenue: orders
        .filter((o) => !o.internal && o.paid_at?.slice(0, 10) === day)
        .reduce((s, o) => s + Number(o.amount), 0),
      spending: events
        .filter((e) => e.created_at?.slice(0, 10) === day)
        .reduce((s, e) => s + Number(e.cost_usd), 0),
    };
  });
}
