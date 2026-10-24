# Netlify web app + Mac worker

Netlify hosts the Next.js dashboard, API, Whop webhook, salesperson pages and buyer download redirects. The Mac runs **one** persistent worker with Docker and Playwright Chromium. Both connect to the existing Supabase project. The worker polls Supabase directly; no tunnel, port forwarding or local web server is needed. The production origin is `https://sidewalkai.netlify.app`.

## 1. Create the Netlify project

1. Import `ishwantsingh/sidewalk` from GitHub into a **Free** Netlify project. Select `main` as the production branch.
2. Keep the repository root as the base directory. The committed `netlify.toml` selects Node 22, runs `npm run check` and publishes `.next`. Netlify automatically applies its Next.js adapter, including API functions. Do not choose static export, add an SPA redirect, or run the worker as a build command.
3. Choose the final site name and copy its stable `https://YOUR_SITE.netlify.app` origin. An initial deploy can show the dashboard before integrations are configured.
4. For this hackathon, disable automatic Deploy Previews and branch deploys in Netlify's continuous deployment settings. Use the stable production URL for webhooks, sales and downloads; preview origins do not match `APP_URL` and must not share live workflows.

No custom domain or paid Netlify plan is needed for the web app. The repository remains usable locally with `npm run dev`.

## 2. Configure both environments

In the Mac's ignored `.env.local`, set:

```dotenv
APP_URL=https://YOUR_SITE.netlify.app
```

In **Netlify project configuration → Environment variables**, import the configured `.env.local` using Netlify's dotenv import. Review the imported values before saving. Never commit or upload the file as a public asset. Keep runtime values available to **Functions** and build values available to **Builds**; Free uses all scopes. Values in `netlify.toml`'s build environment do not configure function runtime secrets.

| Variables                                                                                                    | Placement / synchronization                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`                                                                                                    | Same stable production HTTPS origin in both environments; no path or trailing slash.                                                                                                                                                             |
| `SUPABASE_*`                                                                                                 | Same existing database, service-role key and bucket names. Apply the schema once, not per deploy.                                                                                                                                                |
| `DOWNLOAD_SIGNING_SECRET`                                                                                    | Same random secret of at least 32 characters. Signs sales/opt-out links and delivery capabilities.                                                                                                                                               |
| `WHOP_*`, `TERAC_*`, `RESEND_*`, sender settings, cost estimates, sale/fee settings, `INTERNAL_BUYER_EMAILS` | Keep matching values on Netlify and the Mac; web routes verify payments/reports and the worker sends offers/deliveries.                                                                                                                          |
| Google server key, Exa/OpenAI settings, Lovable OAuth settings                                               | Keep on the Mac and import to Netlify too: the current run-creation configuration gate validates the full pipeline there. Netlify does not execute the worker. Use your own OpenAI key, not an automatically provisioned Netlify AI Gateway key. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`                                 | Required at Netlify **build time** for the map. Use the separate restricted browser key.                                                                                                                                                         |

Use `.env.example` as the full variable checklist; include its bucket, cost and model defaults when importing. Blank required values keep run creation disabled but do not prevent deployment. Only the two `NEXT_PUBLIC_*` Maps values belong in browser code. Keep all other credentials server-side.

Restrict the Google browser key's HTTP referrers to `https://YOUR_SITE.netlify.app/*` and your local development origin. Allow Maps JavaScript and Geocoding APIs. Keep the server key separate with Geocoding and Places API (New) enabled.

`netlify.toml` exempts only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` from secret scanning because that restricted key is intentionally published in browser JavaScript. Secret scanning remains enabled for server credentials.

Lovable OAuth login/refresh runs **only on the Mac**, where it can update `.env.local`. Netlify's copy satisfies configuration validation and does not refresh tokens. After reauthorization or changing OAuth client settings, update the Netlify copies too. The local OAuth callback remains `http://127.0.0.1:8787/callback`.

Register this endpoint in Whop:

```text
POST https://YOUR_SITE.netlify.app/api/webhooks/whop
Event: payment.succeeded
API version date: 2026-10-15-1
```

Copy the unchanged `ws_…` signing secret to `WHOP_WEBHOOK_SECRET` in **both** environments. Configure the verified Resend sender/domain and Terac account as described in the README; deployment does not provision those services.

Trigger a fresh production deploy after importing/changing environment variables. Runtime values are captured per deployment; browser Maps values are embedded during the build. Keep the site publicly reachable for Whop and signed sales/buyer links. Existing dashboard access remains direct and unauthenticated, including its operator APIs.

## 3. Verify the deployment and start the Mac worker

From the repository with Node 22 active:

```sh
npm run verify:deployment -- https://YOUR_SITE.netlify.app
npm run doctor
```

The deployment check reads the dashboard and configuration/runs/businesses/overview endpoints. It rejects redirects, HTML in place of APIs, cached API responses, invalid response shapes and incomplete configuration. Empty real database records pass. It sends no credentials, queues no runs and performs no provider writes. It does not prove webhook acceptance, map-key restrictions, worker availability or end-to-end fulfillment.

Open the deployed dashboard and confirm the Google map loads. `doctor` checks the worker's local dependencies and provider access; its Google/Exa probes can consume API quota. Resolve any reported configuration blockers before starting work.

Keep Docker Desktop running, install Chromium if needed, then start exactly one worker in a dedicated terminal:

```sh
npx playwright install chromium
caffeinate -i npm run worker
```

Keep the Mac plugged in, connected to the internet, and its lid open. `caffeinate` prevents idle system sleep while the worker runs; it does not make a closed or powered-off Mac available. Stop with Ctrl-C, and restart after changing `.env.local`.

Start a small, explicitly budgeted run from the **Netlify dashboard**. The worker claims it from Supabase and processes runs sequentially. Close the dashboard when finished: it polls every five seconds per tab. When the Mac is off, the web app and webhook stay online; queued work, sales polling and email fulfillment wait for the worker. An interrupted in-progress run may fail heartbeat recovery and needs inspection before another paid run.

## Free-tier usage and acceptance

Pipeline runs are not Netlify deployments. Local Docker/browser/build work and provider calls do not consume Netlify function compute. Dashboard requests, API calls, bandwidth and publishing new production deployments do. Source ZIP downloads redirect to Supabase rather than streaming through Netlify.

At the time of setup, new Free accounts have 300 credits/month: production deploys cost 15 credits, web requests 2 per 10,000, bandwidth 20 per GB and functions 10 per GB-hour. Those share one allowance; reaching the free limit pauses hosting. Five or six small runs should fit the hosting allowance, but actual polling, response sizes, visitors and redeploys determine usage. Check Netlify's usage dashboard after the first run. External provider charges/credits and Supabase storage limits remain separate.

`npm run check` and the browser suite verify the local app. Only a successful Netlify deployment verifies the adapter/function bundle. A real signed Whop payment and subsequent worker delivery verify checkout fulfillment; the read-only smoke check does not substitute for them.

## API startup failures

If the dashboard loads but every API route returns an empty HTTP 500, inspect Netlify's **Functions → Next.js Server Handler** logs. A missing `playwright-core/browsers.json` indicates worker browser code entered the serverless dependency graph. Shared payment access lives in `lib/whop.ts`; keep `lib/commerce.ts` (browser storefront verification) in the worker. The API runtime regression test rejects imports of Playwright/Lighthouse. Do not install browsers on Netlify to fix this boundary.

References: [Netlify Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/), [current pricing](https://www.netlify.com/pricing/).
