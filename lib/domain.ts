import type { Brief } from "./research";

export type Classification =
  "NO_WEBSITE" | "POOR_WEBSITE" | "GOOD_WEBSITE" | "NEEDS_REVIEW";
export function classify(
  score: number | null,
  defects: string[],
  confirmedAbsent = false,
): Classification {
  if (confirmedAbsent) return "NO_WEBSITE";
  if (score === null) return "NEEDS_REVIEW";
  return score < 75 || defects.length > 0 ? "POOR_WEBSITE" : "GOOD_WEBSITE";
}
export function hasSourcedContact(brief: Brief) {
  return !!(
    (brief.contactEmail && brief.contactSource) ||
    (brief.contactPhone && brief.phoneSource)
  );
}
export function businessLocation(brief: Brief) {
  return brief.facts.find((fact) => /address|location/i.test(fact.label))
    ?.value;
}
/** Website need determines the tier; contact coverage and lower scores break ties. */
export function leadPriority(
  classification: Classification,
  score: number | null,
  brief: Brief,
) {
  if (!hasSourcedContact(brief)) return 0;
  const tier =
    classification === "NO_WEBSITE"
      ? 1000
      : classification === "POOR_WEBSITE"
        ? 500
        : 0;
  if (!tier) return 0;
  const contacts =
    Number(!!(brief.contactEmail && brief.contactSource)) +
    Number(!!(brief.contactPhone && brief.phoneSource));
  return (
    tier +
    (classification === "POOR_WEBSITE" ? 100 - (score ?? 100) : 0) +
    contacts * 10
  );
}
export function safePath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (p) =>
          p === ".." ||
          p === "" ||
          p.startsWith(".env") ||
          p === ".git" ||
          p === "node_modules",
      ) ||
    /\.(pem|key|p12)$/i.test(path)
  )
    throw new Error(`Unsafe export path: ${path}`);
  return path;
}
export function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function identityKey(
  name: string,
  location: string | undefined,
  website: string | null,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return [
    normalize(name),
    normalize(location ?? ""),
    website ? new URL(website).hostname.replace(/^www\./, "") : "",
  ].join("|");
}
