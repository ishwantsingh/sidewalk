import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { readFile, writeFile } from "node:fs/promises";
import { env } from "./config";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/** Bind our typed operation values to the server-advertised argument names. */
export function toolArguments(tool: Tool, values: Record<string, unknown>) {
  const normalize = (key: string) =>
    key
      .replaceAll("_", "")
      .toLowerCase()
      .replace(/^filepath$/, "path");
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(tool.inputSchema.properties ?? {})) {
    const entry = Object.entries(values).find(
      ([name]) => normalize(name) === normalize(key),
    );
    if (entry && entry[1] !== undefined) args[key] = entry[1];
  }
  for (const required of tool.inputSchema.required ?? []) {
    if (!(required in args))
      throw new Error(
        `Lovable ${tool.name} requires unsupported argument ${required}. Inspect the advertised tool schema.`,
      );
  }
  return args;
}

export class Lovable {
  client = new Client({ name: "sidewalk-ai", version: "1.0.0" });
  tools: Tool[] = [];
  async connect() {
    let tokens: OAuthTokens = JSON.parse(env("LOVABLE_OAUTH_TOKENS"));
    const provider: OAuthClientProvider = {
      redirectUrl: "http://127.0.0.1:8787/callback",
      clientMetadata: {
        client_name: "Sidewalk AI",
        redirect_uris: ["http://127.0.0.1:8787/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      clientInformation: () => ({
        client_id: env("LOVABLE_OAUTH_CLIENT_ID"),
        ...(process.env.LOVABLE_OAUTH_CLIENT_SECRET
          ? { client_secret: process.env.LOVABLE_OAUTH_CLIENT_SECRET }
          : {}),
      }),
      tokens: () => tokens,
      saveTokens: async (value) => {
        tokens = value;
        process.env.LOVABLE_OAUTH_TOKENS = JSON.stringify(value);
        const file = await readFile(".env.local", "utf8");
        await writeFile(
          ".env.local",
          file.replace(
            /^LOVABLE_OAUTH_TOKENS=.*$/m,
            () => `LOVABLE_OAUTH_TOKENS='${JSON.stringify(value)}'`,
          ),
          { mode: 0o600 },
        );
      },
      redirectToAuthorization: async () => {
        throw new Error(
          "Lovable OAuth login expired. Run npm run lovable:auth and restart the worker.",
        );
      },
      saveCodeVerifier: () => {
        throw new Error("Interactive OAuth required: npm run lovable:auth");
      },
      codeVerifier: () => {
        throw new Error("Interactive OAuth required: npm run lovable:auth");
      },
    };
    await this.client.connect(
      new StreamableHTTPClientTransport(new URL(env("LOVABLE_MCP_URL")), {
        authProvider: provider,
      }),
    );
    this.tools = (await this.client.listTools()).tools;
  }
  async call(
    name: string,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Lovable tool unavailable: ${name}`);
    const response = await this.client.callTool(
      { name, arguments: toolArguments(tool, values) },
      undefined,
      { timeout: 900000 },
    );
    if (response.isError)
      throw new Error(
        `Lovable ${name} failed: ${JSON.stringify(response.content)}`,
      );
    if (response.structuredContent)
      return response.structuredContent as Record<string, unknown>;
    const text = (response.content as { type: string; text?: string }[])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    try {
      const parsed = JSON.parse(text);
      // A raw JSON source file is still file text, not a tool-response envelope.
      if (name === "read_file" && typeof parsed?.content !== "string")
        return { content: text };
      return Array.isArray(parsed) ? { files: parsed } : parsed;
    } catch {
      if (name === "read_file") return { content: text };
      throw new Error(
        `Lovable ${name} returned an unsupported response. Inspect its tool contract before retrying.`,
      );
    }
  }
  async close() {
    await this.client.close();
  }
}
