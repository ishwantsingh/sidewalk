import nextEnv from "@next/env";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomBytes } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.LOVABLE_MCP_URL || "https://mcp.lovable.dev");
let client: OAuthClientInformationMixed | undefined = process.env
  .LOVABLE_OAUTH_CLIENT_ID
  ? {
      client_id: process.env.LOVABLE_OAUTH_CLIENT_ID,
      client_secret: process.env.LOVABLE_OAUTH_CLIENT_SECRET,
    }
  : undefined;
let tokens: OAuthTokens | undefined = process.env.LOVABLE_OAUTH_TOKENS
  ? JSON.parse(process.env.LOVABLE_OAUTH_TOKENS)
  : undefined;
let verifier = "";
const state = randomBytes(24).toString("hex");
const provider: OAuthClientProvider = {
  get redirectUrl() {
    return "http://127.0.0.1:8787/callback";
  },
  get clientMetadata() {
    return {
      client_name: "Sidewalk AI",
      redirect_uris: ["http://127.0.0.1:8787/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  },
  state: () => state,
  clientInformation: () => client,
  saveClientInformation: (info) => {
    client = info;
  },
  tokens: () => tokens,
  saveTokens: (value) => {
    tokens = value;
  },
  redirectToAuthorization: async (authorizationUrl) => {
    console.log(`Open this URL to authorize Lovable:\n${authorizationUrl}`);
  },
  saveCodeVerifier: (value) => {
    verifier = value;
  },
  codeVerifier: () => verifier,
};
const server = createServer(async (req, res) => {
  try {
    const callback = new URL(req.url!, "http://127.0.0.1:8787");
    if (
      callback.pathname !== "/callback" ||
      callback.searchParams.get("state") !== state
    )
      throw new Error("Invalid OAuth state");
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("No authorization code");
    await auth(provider, { serverUrl: url, authorizationCode: code });
    let contents = await readFile(".env.local", "utf8").catch(() => "");
    const values = {
      LOVABLE_OAUTH_CLIENT_ID: client!.client_id,
      LOVABLE_OAUTH_CLIENT_SECRET: client!.client_secret ?? "",
      LOVABLE_OAUTH_TOKENS: JSON.stringify(tokens),
    };
    for (const [key, value] of Object.entries(values)) {
      const line = `${key}='${value}'`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      contents = pattern.test(contents)
        ? contents.replace(pattern, () => line)
        : `${contents}\n${line}`;
    }
    await writeFile(".env.local", contents, { mode: 0o600 });
    res.end("Lovable connected. You can close this tab.");
    console.log(
      "OAuth credentials saved to .env.local. Restart app and worker.",
    );
    server.close();
  } catch (error) {
    res.statusCode = 400;
    res.end("Authorization failed. See terminal.");
    console.error(error);
  }
});
server.listen(8787, "127.0.0.1", async () => {
  try {
    const result = await auth(provider, { serverUrl: url });
    if (result === "AUTHORIZED") {
      console.log("Existing token authorized.");
      server.close();
    }
  } catch (error) {
    console.error(error);
    server.close();
    process.exitCode = 1;
  }
});
