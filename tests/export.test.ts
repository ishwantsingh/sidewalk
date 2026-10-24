import { describe, expect, it, vi } from "vitest";
import {
  sourcePackage,
  deploymentReadme,
  readProjectSource,
} from "../lib/export";

const ref = "a".repeat(40);
const page = (paths: string[], next: string | null = null) => ({
  ref,
  data: paths.map((path) => ({ path, binary: false })),
  pagination: { has_more: next !== null, next_cursor: next },
});
const content = '{"name":"website","content":"preserve this field"}\n';

describe("complete Lovable source export", () => {
  it("follows every cursor and reads all files from the same immutable commit", async () => {
    const call = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_files")
        return args.cursor
          ? page(["src/App.tsx"])
          : page(["package.json", "index.html"], "page-2");
      if (name === "read_file") return { content };
      throw new Error("Unexpected provider command");
    });
    const source = await readProjectSource({ call }, "project-1", ref);
    expect(source).toEqual(
      ["package.json", "index.html", "src/App.tsx"].map((path) => ({
        path,
        content,
      })),
    );
    expect(
      call.mock.calls
        .filter(([name]) => name === "list_files")
        .map(([, args]) => args),
    ).toEqual([
      { project_id: "project-1", ref, limit: 100, cursor: undefined },
      { project_id: "project-1", ref, limit: 100, cursor: "page-2" },
    ]);
    expect(call.mock.calls.every(([, args]) => args.ref === ref)).toBe(true);
  });
  it.each([
    { files: ["package.json"] },
    { ...page(["package.json"]), ref: "b".repeat(40) },
    { ...page(["package.json"]), truncated: true },
    {
      ...page(["package.json"]),
      pagination: { has_more: true, next_cursor: null },
    },
    {
      ...page(["package.json"]),
      pagination: { has_more: false, next_cursor: "unexpected" },
    },
    { ...page(["package.json"]), data: null },
    page([]),
  ])(
    "rejects incomplete listings before reading any source",
    async (listing) => {
      const call = vi.fn().mockResolvedValue(listing);
      await expect(
        readProjectSource({ call }, "project-1", ref),
      ).rejects.toThrow();
      expect(call.mock.calls.every(([name]) => name === "list_files")).toBe(
        true,
      );
    },
  );
  it("rejects a failed later page rather than exporting the first page alone", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(page(["package.json"], "page-2"))
      .mockRejectedValueOnce(new Error("listing failed"));
    await expect(readProjectSource({ call }, "project-1", ref)).rejects.toThrow(
      "listing failed",
    );
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("rejects repeating cursors and duplicate paths across pages", async () => {
    for (const second of [
      page(["src/App.tsx"], "page-2"),
      page(["package.json"]),
    ]) {
      const call = vi
        .fn()
        .mockResolvedValueOnce(page(["package.json"], "page-2"))
        .mockResolvedValueOnce(second);
      await expect(
        readProjectSource({ call }, "project-1", ref),
      ).rejects.toThrow(/cursor|Duplicate/);
      expect(call).toHaveBeenCalledTimes(2);
    }
  });
  it.each([
    { path: "public/logo.png", binary: true },
    { path: "public/logo.png", binary: false },
    { path: "../escape.ts", binary: false },
    { path: ".env.local", binary: false },
    { path: "src/App.tsx" },
  ])(
    "rejects unsafe, binary or unclassified files before reading them",
    async (file) => {
      const call = vi.fn().mockResolvedValue({ ...page([]), data: [file] });
      await expect(
        readProjectSource({ call }, "project-1", ref),
      ).rejects.toThrow();
      expect(call).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { content: "partial", truncated: true },
    { content: "encoded", encoding: "base64" },
    { content: "null\0byte" },
    { content: "-----BEGIN PRIVATE KEY-----" },
  ])("rejects incomplete or secret-containing source", async (result) => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(page(["src/App.tsx"]))
      .mockResolvedValueOnce(result);
    await expect(
      readProjectSource({ call }, "project-1", ref),
    ).rejects.toThrow();
  });
  it("rejects mutable HEAD before calling Lovable", async () => {
    const call = vi.fn();
    await expect(
      readProjectSource({ call }, "project-1", "HEAD"),
    ).rejects.toThrow("commit SHA");
    expect(call).not.toHaveBeenCalled();
  });
});

it("exports current TanStack app source and text configs without requiring a legacy index.html", async () => {
  const paths = [
    "package.json",
    "src/routes/index.tsx",
    "src/server.ts",
    "vite.config.ts",
    ".prettierrc",
    ".prettierignore",
    "bunfig.toml",
    "wrangler.jsonc",
  ];
  const pkg = {
    dependencies: { react: "19", "@tanstack/react-start": "1" },
    scripts: { build: "vite build" },
  };
  const call = vi.fn(async (name: string, args: Record<string, unknown>) =>
    name === "list_files"
      ? page(paths)
      : {
          content: args.path === "package.json" ? JSON.stringify(pkg) : "text",
        },
  );
  const source = await readProjectSource({ call }, "project-1", ref);
  expect(sourcePackage(source)).toEqual(pkg);
  const readme = deploymentReadme("Business", pkg);
  expect(readme).toContain("server output together with its public assets");
  expect(readme).not.toContain(
    "Deploy the generated dist directory to a static host",
  );
});
it("requires a real React package and build command", () => {
  expect(() =>
    sourcePackage([
      { path: "package.json", content: '{"scripts":{"build":"echo okay"}}' },
      { path: "src/index.tsx", content: "" },
    ]),
  ).toThrow("React dependency");
});
