import type { Brief } from "./research";

export function isOfficialWebsiteLink(
  href: string,
  officialWebsite: string | null,
) {
  if (!officialWebsite) return false;
  try {
    const official = new URL(officialWebsite).hostname.replace(/^www\./, "");
    const link = new URL(href);
    return (
      ["https:", "http:"].includes(link.protocol) &&
      (link.hostname.replace(/^www\./, "") === official ||
        link.hostname.endsWith(`.${official}`))
    );
  } catch {
    return false;
  }
}

export function conceptDefects(
  metrics: { text: string; links: { href: string }[]; images: string[] },
  name: string,
  brief?: Brief,
) {
  const defects: string[] = [];
  const normalized = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized(metrics.text).includes(normalized(name)))
    defects.push("Business name does not match");
  if (
    metrics.links.some((link) =>
      isOfficialWebsiteLink(link.href, brief?.officialWebsite ?? null),
    )
  )
    defects.push(
      "Remove links to the business's existing official website; use local menu/contact sections instead",
    );
  if (
    brief?.content?.testimonials.length &&
    !brief.content.testimonials.some(
      (review) =>
        normalized(metrics.text).includes(normalized(review.quote)) &&
        normalized(metrics.text).includes(normalized(review.author)),
    )
  )
    defects.push(
      "Missing sourced customer testimonial with its exact quote and reviewer name",
    );
  if (
    brief?.content?.photos.length &&
    !brief.content.photos.some((photo) => metrics.images.includes(photo.url))
  )
    defects.push("Missing supplied real business photography");
  return defects;
}
