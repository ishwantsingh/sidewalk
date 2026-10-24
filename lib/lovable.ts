import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { readFile, writeFile } from "node:fs/promises";
import { env } from "./config";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Bind our typed operation values to the server-advertised argument names. */
export function toolArguments(tool: Tool, values: Record<string, unknown>) {
  const normalize = (key: string) =>
    key
      .replaceAll("_", "")
      .toLowerCase()
      .replace(/^filepath$/, "path");
  const args: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const key = Object.keys(tool.inputSchema.properties ?? {}).find(
      (key) => normalize(name) === normalize(key),
    );
    if (!key) throw new Error(`Lovable ${tool.name} does not support ${name}`);
    args[key] = value;
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
      {
        timeout: ["create_project", "send_message"].includes(name)
          ? 900000
          : 30000,
      },
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
    // read_file returns source text, even when the source itself is a JSON object.
    if (name === "read_file") return { content: text };
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Unsupported result");
      return parsed;
    } catch {
      throw new Error(
        `Lovable ${name} returned an unsupported response. Inspect its tool contract before retrying.`,
      );
    }
  }
  /** Wait for the agent, not the scaffold's top-level provisioning status. */
  async waitForBuild(projectId: string, initial: Record<string, any>) {
    const deadline = Date.now() + 15 * 60 * 1000;
    let agent = initial.agent_response ?? initial;
    const messageId = initial.message_id ?? agent.message_id;
    const threadId = initial.thread_id ?? agent.thread_id;
    let polled = false;
    while (Date.now() < deadline) {
      if (
        agent.awaiting_input ||
        agent.status === "awaiting_input" ||
        agent.queue_paused
      )
        throw new Error(
          `Lovable build paused for input; open project ${projectId} in Lovable`,
        );
      if (agent.error || ["failed", "error", "stopped"].includes(agent.status))
        throw new Error(
          `Lovable build did not complete; inspect project ${projectId}`,
        );
      if (agent.status === "completed") {
        const project = await this.call("get_project", {
          project_id: projectId,
        });
        const buildState = z
          .object({
            agentFinished: z.boolean(),
            status: z.string().optional(),
          })
          .parse(project.project);
        if (
          project.error ||
          project.status === "failed" ||
          project.creation_status === "failed" ||
          buildState.status === "failed"
        )
          throw new Error(
            `Lovable project failed; inspect project ${projectId}`,
          );
        if (
          buildState.agentFinished === true &&
          typeof project.preview_url === "string" &&
          project.preview_url &&
          typeof project.latest_commit_sha === "string" &&
          /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(project.latest_commit_sha) &&
          (!agent.commit_sha || agent.commit_sha === project.latest_commit_sha)
        )
          return { url: project.preview_url, ref: project.latest_commit_sha };
      }
      if (typeof messageId !== "string" || !messageId)
        throw new Error(
          `Lovable build has no message ID; inspect project ${projectId}`,
        );
      if (polled) await new Promise((resolve) => setTimeout(resolve, 5000));
      if (Date.now() >= deadline) break;
      const message = await this.call("get_message", {
        project_id: projectId,
        message_id: messageId,
        thread_id: threadId,
      });
      // get_message.status describes the user message and never becomes terminal.
      agent = message.response ?? { status: "in_progress" };
      if (message.awaiting_input || message.queue_paused)
        throw new Error(
          `Lovable build paused for input; open project ${projectId} in Lovable`,
        );
      if (message.error)
        throw new Error(`Lovable message failed; inspect project ${projectId}`);
      polled = true;
    }
    throw new Error(
      `Lovable build timed out; inspect project ${projectId} before retrying`,
    );
  }
  async close() {
    await this.client.close();
  }
}
