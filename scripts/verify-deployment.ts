import { pathToFileURL } from "node:url";
import { z } from "zod";

// Public HTTP checks only. Do not load local credentials or start paid work.
export async function verifyDeployment(
  input: string,
  request: typeof fetch = fetch,
) {
  const origin = new URL(input);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "Supply the production HTTPS origin without a path or credentials",
    );

  async function get(path: string, json: boolean) {
    const response = await request(new URL(path, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes(json ? "application/json" : "text/html"))
      throw new Error(
        `${path}: unexpected content type; check routing and deployment access`,
      );
    if (json && !response.headers.get("cache-control")?.includes("no-store"))
      throw new Error(`${path}: API response must use Cache-Control: no-store`);
    return response;
  }

  const checks = await Promise.all([
    get("/", false),
    get("/api/config", true).then(async (r) =>
      z.object({ missing: z.array(z.string()) }).parse(await r.json()),
    ),
    ...["runs", "businesses"].map((path) =>
      get(`/api/${path}`, true).then(async (r) =>
        z.array(z.object({ id: z.string() })).parse(await r.json()),
      ),
    ),
    get("/api/overview", true).then(async (r) =>
      z
        .object({ orders: z.array(z.unknown()), events: z.array(z.unknown()) })
        .parse(await r.json()),
    ),
  ]);
  const config = checks[1] as { missing: string[] };
  // Report variable names only; never print response bodies or provider errors.
  if (config.missing.length)
    throw new Error(
      `Deployment reachable; configure: ${config.missing.join(", ")}`,
    );
  return "PASS: dashboard, configuration, runs, businesses and overview. No work started.";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const origin = process.argv[2];
  if (!origin) {
    console.error(
      "Usage: npm run verify:deployment -- https://YOUR_SITE.netlify.app",
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(await verifyDeployment(origin));
    } catch (error) {
      console.error(
        error instanceof z.ZodError
          ? "FAIL: unexpected API response shape"
          : error instanceof TypeError || !(error instanceof Error)
            ? "FAIL: request failed; check the production HTTPS origin and connectivity"
            : `FAIL: ${error.message}`,
      );
      process.exitCode = 1;
    }
  }
}
