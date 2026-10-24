export type Classification =
  "NO_WEBSITE" | "POOR_WEBSITE" | "GOOD_WEBSITE" | "NEEDS_REVIEW";
export function classify(
  score: number | null,
  defects: string[],
  confirmedAbsent = false,
): Classification {
  if (confirmedAbsent) return "NO_WEBSITE";
  if (score === null) return "NEEDS_REVIEW";
  return score >= 45
    ? "GOOD_WEBSITE"
    : defects.length >= 2
      ? "POOR_WEBSITE"
      : "NEEDS_REVIEW";
}
export function economics(
  score: number | null,
  classification: Classification,
  hasContact: boolean,
  completeness: number,
  price: number,
  buildCost: number,
  researchCost: number,
  feePercent: number,
  feeFixed: number,
  salesCost = 0,
) {
  const opportunity =
    classification === "NO_WEBSITE" ? 100 : score === null ? 0 : 100 - score;
  const probability = Math.min(
    0.3,
    Math.max(
      0,
      0.02 +
        (opportunity / 100) * 0.12 +
        (hasContact ? 0.06 : 0) +
        completeness * 0.05,
    ),
  );
  const expected =
    probability * (price - (price * feePercent) / 100 - feeFixed) -
    buildCost -
    researchCost -
    salesCost;
  return {
    website_opportunity: opportunity,
    quoted_price: price,
    estimated_build_cost: buildCost,
    research_cost: researchCost,
    estimated_sales_cost: salesCost,
    purchase_probability: probability,
    expected_contribution: expected,
    priority: hasContact ? opportunity * 0.6 + completeness * 20 + expected : 0,
  };
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
