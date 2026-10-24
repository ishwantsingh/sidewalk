import type { Row } from "./dashboard";

export const DEFAULT_AREA = "Williamsburg, Brooklyn";
export const DEFAULT_CENTER = { lat: 40.714, lng: -73.958 };
export const websiteStatuses = {
  GOOD_WEBSITE: { label: "Good website", color: "#27865c" },
  POOR_WEBSITE: { label: "Poor website", color: "#d69e17" },
  NO_WEBSITE: { label: "No website", color: "#d34d48" },
  NEEDS_REVIEW: { label: "Needs review", color: "#737d89" },
} as const;
export type WebsiteStatus = keyof typeof websiteStatuses;

export function latestAudit(business: Row): Row | undefined {
  return [...(business.audits ?? [])].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0];
}

export function websiteStatus(business: Row): WebsiteStatus {
  const latest = latestAudit(business)?.classification;
  return Object.hasOwn(websiteStatuses, latest) ? latest : "NEEDS_REVIEW";
}

export function areaBusinesses(businesses: Row[], runs: Row[], area: string) {
  const runIds = new Set(
    runs.filter((r) => r.params.area === area).map((r) => r.id),
  );
  return businesses.filter((b) => runIds.has(b.run_id));
}

export function samplePosition(
  business: Row,
): { lat: number; lng: number } | null {
  const p = business.demo_location;
  return p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
    ? p
    : null;
}
