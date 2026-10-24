import { expect, it } from "vitest";
import { sitePrompt, repairPrompt } from "../lib/site-prompt";
import { conceptDefects, isOfficialWebsiteLink } from "../lib/site-qa";
import type { Brief } from "../lib/research";

const brief: Brief = {
  name: "Maple Cafe",
  category: "cafe",
  officialWebsite: "https://www.maple.example/menu",
  websiteAbsent: false,
  ambiguous: false,
  chain: false,
  contactEmail: null,
  contactSource: null,
  contactPhone: null,
  phoneSource: null,
  facts: [],
  direction: "Cozy",
  content: {
    collectedAt: "2026-10-24T12:00:00Z",
    testimonials: [
      {
        quote: "Excellent coffee!",
        author: "Sam",
        authorUri: null,
        rating: 5,
        source: "https://maps.google.com/reviews/1",
        publishedAt: null,
      },
    ],
    photos: [
      {
        url: "https://cdn.example/cafe.jpg",
        source: "https://maps.google.com/photos/1",
        provider: "Google Maps",
        attribution: [],
        alt: "Cafe interior",
      },
    ],
    menuImages: [
      {
        url: "https://cdn.example/menu.jpg",
        source: "https://maple.example/menu",
        provider: "Exa",
        attribution: [],
        alt: "Coffee menu",
      },
    ],
    visualDirection: "Warm timber and cream",
    issues: [],
  },
};

it("provides sourced content and explicit instructions for rotating quotes, real photos and a digital menu", () => {
  const prompt = sitePrompt(brief);
  expect(JSON.parse(prompt.split("VERIFIED BRIEF:\n")[1])).toEqual(brief);
  for (const instruction of [
    "continuously rotating seamless loop",
    "prefers-reduced-motion",
    "exact reviewer name",
    "Open and visually read every content.menuImages URL",
    "Warm timber and cream",
    "direct image URLs as image sources",
    "Do not add any links",
  ])
    expect(prompt).toContain(instruction);
  for (const promptText of [prompt, repairPrompt(["broken contact link"])]) {
    expect(promptText).not.toContain(
      "Unofficial concept, not affiliated with this business",
    );
    expect(promptText).not.toContain("noindex");
    expect(promptText).not.toContain("concept notice");
    expect(promptText).not.toContain(
      "No backend, secrets, integrations, binary files, copyrighted photos",
    );
  }
});

it("allows a factual concept without the removed notice and indexing requirements", () => {
  expect(
    conceptDefects(
      {
        text: "Maple Cafe. Excellent coffee! — Sam",
        links: [],
        images: ["https://cdn.example/cafe.jpg"],
      },
      brief.name,
      brief,
    ),
  ).toEqual([]);
});

it("rejects official-site links and their subdomains while allowing local and attribution navigation", () => {
  for (const url of [
    "https://maple.example",
    "http://www.maple.example/menu",
    "https://menu.maple.example/order",
  ])
    expect(isOfficialWebsiteLink(url, brief.officialWebsite)).toBe(true);
  for (const url of [
    "#menu",
    "tel:12125550100",
    "https://maps.google.com/place/maple",
    "https://maple.example.evil.test",
    "https://othermaple.example",
  ])
    expect(isOfficialWebsiteLink(url, brief.officialWebsite)).toBe(false);
  expect(
    conceptDefects(
      {
        text: "Maple Cafe. Excellent coffee! — Sam",
        links: [{ href: "https://maple.example/menu" }],
        images: ["https://cdn.example/cafe.jpg"],
      },
      brief.name,
      brief,
    ),
  ).toEqual([expect.stringContaining("Remove links")]);
});

it("requires supplied testimonials and real photography without requiring unavailable content", () => {
  const metrics = { text: "Maple Cafe", links: [], images: [] };
  expect(conceptDefects(metrics, brief.name, brief)).toEqual([
    expect.stringContaining("exact quote and reviewer name"),
    expect.stringContaining("real business photography"),
  ]);
  expect(
    conceptDefects(metrics, brief.name, { ...brief, content: undefined }),
  ).toEqual([]);
});
