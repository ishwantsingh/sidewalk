import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { env } from "./config";

const validator = new AjvJsonSchemaValidator();
const normalize = (name: string) => name.replaceAll("_", "").toLowerCase();
/** Require every supplied field to be supported; never silently omit task/budget constraints. */
export function teracArguments(tool: Tool, values: Record<string, unknown>) {
  const args: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const key = Object.keys(tool.inputSchema.properties ?? {}).find(
      (key) => normalize(key) === normalize(name),
    );
    if (!key)
      throw new Error(
        `Terac ${tool.name} does not support ${name}; inspect its live schema`,
      );
    args[key] = value;
  }
  const result = validator.getValidator(tool.inputSchema)(args);
  if (!result.valid)
    throw new Error(`Terac ${tool.name} contract: ${result.errorMessage}`);
  return args;
}
export function teracResult(
  response: Record<string, any>,
): Record<string, any> {
  if (response.isError) {
    const detail = (response.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ")
      .slice(0, 500);
    throw new Error(
      `Terac rejected the operation; inspect its dashboard before retrying${detail ? `: ${detail}` : ""}`,
    );
  }
  let result = response.structuredContent;
  if (!result) {
    const text = (response.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(
        "Terac returned no structured result; inspect its tool contract",
      );
    }
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Unsupported Terac response envelope");
  if (result.error) throw new Error("Terac returned an error envelope");
  return result.data ?? result;
}
export const teracTools = [
  "terac_get_context",
  "terac_create_opportunity",
  "terac_get_opportunity",
  "terac_launch_draft_opportunity",
  "terac_get_submission",
  "terac_approve_submission",
];
export class Terac {
  client = new Client({ name: "sidewalk-ai", version: "1.0.0" });
  tools: Tool[] = [];
  async connect() {
    await this.client.connect(
      new StreamableHTTPClientTransport(new URL("https://terac.com/api/mcp"), {
        requestInit: { headers: { "x-api-key": env("TERAC_API_KEY") } },
      }),
    );
    this.tools = (await this.client.listTools()).tools;
    for (const name of teracTools)
      if (!this.tools.some((tool) => tool.name === name))
        throw new Error(`Missing Terac tool ${name}`);
    await this.call("terac_get_context", {});
  }
  async call(name: string, values: Record<string, unknown>) {
    const tool = this.tools.find((tool) => tool.name === name);
    if (!tool) throw new Error(`Missing Terac tool ${name}`);
    return teracResult(
      await this.client.callTool(
        { name, arguments: teracArguments(tool, values) },
        undefined,
        // Draft creation prices the audience server-side and can exceed 30s.
        { timeout: name === "terac_create_opportunity" ? 120000 : 30000 },
      ),
    );
  }
  async close() {
    await this.client.close();
  }
}
