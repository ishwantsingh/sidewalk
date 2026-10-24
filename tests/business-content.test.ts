import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  request: vi.fn(),
  json: vi.fn(),
  publicUrl: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("../lib/http", () => ({
  request: f.request,
  json: f.json,
  publicUrl: f.publicUrl,
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { parse: f.parse } };
  },
}));
import {
  businessContentCost,
  collectBusinessContent,
} from "../lib/business-content";
import type { Brief } from "../lib/research";

const brief: Brief = {
  name: "Maple Cafe",
  category: "cafe",
  officialWebsite: "https://maple.example",
  websiteAbsent: false,
  ambiguous: false,
  chain: false,
  contactEmail: null,
  contactSource: null,
  contactPhone: null,
  phoneSource: null,
  facts: [
    {
      label: "Address",
      value: "123 Maple Street",
      source: "https://maple.example",
      confidence: "high",
    },
  ],
  direction: "Warm neighborhood cafe",
};
const review = {
  name: "places/place-1/reviews/review-1",
  rating: 5,
  originalText: { text: "Wonderful coffee and a lovely quiet space." },
  text: { text: "Translated review" },
  authorAttribution: {
    displayName: "Sam Lee",
    uri: "https://maps.google.com/contrib/sam",
  },
  googleMapsUri: "https://www.google.com/maps/reviews/review-1",
  publishTime: "2026-09-01T12:00:00Z",
};
const googlePhoto = (name: string) => ({
  name: `places/place-1/photos/${name}`,
  authorAttributions: [
    { displayName: "Alex", uri: "//maps.google.com/contrib/alex" },
  ],
  googleMapsUri: `https://www.google.com/maps/photos/${name}`,
});
let place: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    GOOGLE_MAPS_API_KEY: "private-google-key",
    EXA_API_KEY: "private-exa-key",
    OPENAI_API_KEY: "private-openai-key",
    OPENAI_MODEL: "test-model",
    COST_PLACES_SEARCH_USD: "0.04",
    COST_EXA_SEARCH_USD: "0.01",
    COST_MODEL_RESEARCH_USD: "0.10",
  }))
    vi.stubEnv(key, value);
  place = {
    googleMapsUri: "https://www.google.com/maps/place/maple",
    reviews: [review],
    photos: [googlePhoto("interior"), googlePhoto("menu")],
  };
  f.request.mockImplementation(async (url: string) => {
    if (url.endsWith("/places/place-1")) return Response.json(place);
    if (url.includes("/media?")) {
      const name = url.includes("/interior/") ? "interior" : "menu";
      return Response.json({
        photoUri: `https://lh3.googleusercontent.com/${name}`,
      });
    }
    return new Response("image", { headers: { "content-type": "image/jpeg" } });
  });
  f.json.mockResolvedValue({ results: [] });
  f.publicUrl.mockImplementation(async (url: string) => url);
  f.parse.mockResolvedValue({
    choices: [
      {
        message: {
          parsed: {
            visualDirection: "Warm timber, cream walls and muted green accents",
            images: [
              { id: 0, kind: "interior", alt: "Warm wooden cafe interior" },
              { id: 1, kind: "menu", alt: "Coffee menu with prices" },
            ],
          },
        },
      },
    ],
  });
});
afterEach(() => vi.unstubAllEnvs());

it("saves exact positive reviews and named attributions, with separate real photos and menu images", async () => {
  place.reviews = [
    review,
    review,
    { ...review, name: "bad", rating: 2 },
    {
      ...review,
      name: "blank",
      originalText: { text: "" },
      text: { text: "" },
    },
    { ...review, name: "unnamed", authorAttribution: {} },
  ];
  const content = await collectBusinessContent(brief, "place-1");
  expect(content.testimonials).toEqual([
    {
      quote: review.originalText.text,
      author: "Sam Lee",
      authorUri: review.authorAttribution.uri,
      rating: 5,
      source: review.googleMapsUri,
      publishedAt: review.publishTime,
    },
  ]);
  expect(content.photos).toEqual([
    expect.objectContaining({
      url: "https://lh3.googleusercontent.com/interior",
      source: "https://www.google.com/maps/photos/interior",
      attribution: [
        { name: "Alex", uri: "https://maps.google.com/contrib/alex" },
      ],
    }),
  ]);
  expect(content.menuImages[0].url).toBe(
    "https://lh3.googleusercontent.com/menu",
  );
  expect(content.visualDirection).toContain("Warm timber");
  expect(content.issues).toEqual([]);
  expect(JSON.stringify(content)).not.toContain("private-google-key");
  expect(f.request).toHaveBeenCalledWith(
    expect.stringContaining("skipHttpRedirect=true"),
    {
      headers: { "X-Goog-Api-Key": "private-google-key" },
    },
  );
  expect(f.json).toHaveBeenCalledWith(
    "https://api.exa.ai/search",
    expect.objectContaining({
      contents: { text: { maxCharacters: 3000 }, extras: { imageLinks: 8 } },
    }),
    expect.anything(),
  );
});

it("uses Exa menu photos for verified sources and exact identities, excluding namesakes and invented image IDs", async () => {
  place.photos = [];
  f.json.mockResolvedValue({
    results: [
      {
        url: "https://maple.example/menu",
        extras: {
          imageLinks: [
            "https://cdn.example/menu.jpg",
            "https://cdn.example/menu.jpg",
            "https://cdn.example/secret.jpg?key=private",
          ],
        },
      },
      {
        url: "https://directory.example/maple-cafe",
        text: "Maple Cafe, 123 Maple Street",
        image: "https://cdn.example/cafe.jpg",
      },
      {
        url: "https://directory.example/other-maple-cafe",
        text: "Maple Cafe in another city",
        image: "https://cdn.example/wrong.jpg",
      },
    ],
  });
  f.parse.mockResolvedValue({
    choices: [
      {
        message: {
          parsed: {
            visualDirection: "Cozy",
            images: [
              { id: 0, kind: "menu", alt: "Menu" },
              { id: 1, kind: "interior", alt: "Cafe" },
              { id: 0, kind: "food", alt: "Duplicate" },
              { id: 99, kind: "menu", alt: "Fabricated" },
            ],
          },
        },
      },
    ],
  });
  const content = await collectBusinessContent(
    { ...brief, officialWebsite: null },
    "place-1",
  );
  // Without an official site, only the exact name/address match qualifies.
  expect(content.menuImages[0].url).toBe("https://cdn.example/cafe.jpg");
  expect(content.menuImages).toHaveLength(1);
  expect(JSON.stringify(f.parse.mock.calls)).not.toContain("wrong.jpg");
  expect(JSON.stringify(f.parse.mock.calls)).not.toContain("secret.jpg");
  const withOfficial = await collectBusinessContent(brief, "place-1");
  expect(withOfficial.menuImages[0].url).toBe("https://cdn.example/menu.jpg");
  expect(withOfficial.photos[0].url).toBe("https://cdn.example/cafe.jpg");
});

it("bounds photo lookups and never resolves a photo belonging to another place", async () => {
  place.photos = [
    { ...googlePhoto("alien"), name: "places/wrong-place/photos/alien" },
    ...Array.from({ length: 15 }, (_, i) => googlePhoto(`photo-${i}`)),
  ];
  await collectBusinessContent(brief, "place-1");
  const lookups = f.request.mock.calls.filter(([url]) =>
    url.includes("/media?"),
  );
  expect(lookups).toHaveLength(10);
  expect(lookups.every(([url]) => !url.includes("wrong-place"))).toBe(true);
  expect(businessContentCost()).toBeCloseTo(0.55);
});

it("reports unavailable sources and empty content without fabricated testimonials or menus", async () => {
  f.request.mockRejectedValue(new Error("Provider unavailable"));
  f.json.mockRejectedValue(new Error("Provider unavailable"));
  const content = await collectBusinessContent(brief, "place-1");
  expect(content.testimonials).toEqual([]);
  expect(content.photos).toEqual([]);
  expect(content.menuImages).toEqual([]);
  expect(content.issues.join(" ")).toContain("could not be retrieved");
  expect(content.issues.join(" ")).toContain("do not invent a menu");
  expect(f.parse).not.toHaveBeenCalled();
});

it("keeps Google content when supplemental search has a malformed response", async () => {
  f.json.mockResolvedValue({ unexpected: "provider shape changed" });
  const content = await collectBusinessContent(brief, "place-1");
  expect(content.testimonials[0].author).toBe("Sam Lee");
  expect(content.photos).toHaveLength(1);
  expect(content.menuImages).toHaveLength(1);
  expect(content.issues).toContain(
    "Supplemental menu/photo search could not be retrieved.",
  );
});

it("excludes authenticated, private and non-image URLs before passing photos to vision", async () => {
  place.photos = [];
  f.json.mockResolvedValue({
    results: [
      {
        url: "https://maple.example/menu",
        extras: {
          imageLinks: [
            "https://cdn.example/menu?API_KEY=secret",
            "https://places.googleapis.com/v1/photos/secret",
            "https://user:password@cdn.example/menu.jpg",
            "https://private.example/image.jpg",
            "https://cdn.example/not-an-image",
          ],
        },
      },
    ],
  });
  f.publicUrl.mockRejectedValue(new Error("Private network URL blocked"));
  const privateContent = await collectBusinessContent(brief, "place-1");
  expect(privateContent.photos).toEqual([]);
  expect(f.parse).not.toHaveBeenCalled();
  expect(f.publicUrl).toHaveBeenCalledTimes(2);
  f.publicUrl.mockImplementation(async (url: string) => url);
  f.request.mockImplementation(async (url: string) =>
    url.endsWith("/places/place-1")
      ? Response.json(place)
      : new Response("HTML", { headers: { "content-type": "text/html" } }),
  );
  const htmlContent = await collectBusinessContent(brief, "place-1");
  expect(htmlContent.photos).toEqual([]);
  expect(f.parse).not.toHaveBeenCalled();
});
