import { expect, it } from "vitest";
import { toolArguments } from "../lib/lovable";
it("uses the MCP server advertised parameter names without an LLM", () => {
  expect(
    toolArguments(
      {
        name: "read_file",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            file_path: { type: "string" },
            ref: { type: "string" },
          },
          required: ["projectId", "file_path"],
        },
      },
      { project_id: "project-1", path: "src/App.tsx", ref: "HEAD" },
    ),
  ).toEqual({ projectId: "project-1", file_path: "src/App.tsx", ref: "HEAD" });
});
it("fails closed if the integration requires an unknown field", () => {
  expect(() =>
    toolArguments(
      {
        name: "read_file",
        inputSchema: {
          type: "object",
          properties: { newField: { type: "string" } },
          required: ["newField"],
        },
      },
      {},
    ),
  ).toThrow("unsupported argument");
});
it("never silently drops supplied wait, revision or pagination controls", () => {
  for (const field of ["wait", "ref", "cursor"])
    expect(() =>
      toolArguments(
        { name: "test", inputSchema: { type: "object", properties: {} } },
        { [field]: true },
      ),
    ).toThrow(`does not support ${field}`);
});

it("preserves a raw JSON source file as source text", async () => {
  const { Lovable } = await import("../lib/lovable");
  const { vi } = await import("vitest");
  const lovable = new Lovable();
  lovable.tools = [
    {
      name: "read_file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    },
  ];
  const source = '{"name":"site","scripts":{"build":"vite build"}}';
  vi.spyOn(lovable.client, "callTool").mockResolvedValue({
    content: [{ type: "text", text: source }],
  });
  expect(await lovable.call("read_file", { path: "package.json" })).toEqual({
    content: source,
  });
});

it("does not mistake a JSON source file's content property for an MCP envelope", async () => {
  const { Lovable } = await import("../lib/lovable");
  const { vi } = await import("vitest");
  const lovable = new Lovable();
  lovable.tools = [
    {
      name: "read_file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    },
  ];
  const source = '{"content":"this is source data","name":"site"}\n';
  vi.spyOn(lovable.client, "callTool").mockResolvedValue({
    content: [{ type: "text", text: source }],
  });
  expect(await lovable.call("read_file", { path: "content.json" })).toEqual({
    content: source,
  });
});
