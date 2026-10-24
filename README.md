# Sidewalk AI

An autonomous local website agency: Google Places → independent Exa research → real browser audit → Lovable → clean source ZIP → individual Whop product → sales email + Terac salesperson → verified payment → automatic private ZIP delivery.

Next.js operator dashboard, one persistent TypeScript worker, Supabase Postgres/Storage. The dashboard always reads persisted Supabase records, even while sales or delivery integrations are incomplete. Empty databases stay empty and connection failures stay visible. Run creation and worker startup require valid configuration.

## Start locally

Requirements: **Node.js 22.19+**, npm, Docker with its daemon running. Docker builds generated code in disposable containers without application secrets. The worker must run on the Docker host so its temporary build directory can be mounted.

```sh
nvm use
npm ci
npx playwright install chromium
cp .env.example .env.local
```

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL editor. It creates eleven tables, transactional run/cost functions, a private `website-zips` bucket and a public screenshot bucket. Keep the ZIP bucket private. Table RLS grants no browser access; the service-role key stays server-side.
2. Fill `.env.local` using the notes below. Use a long random download-signing secret. Do not prefix secrets with `NEXT_PUBLIC_`.
3. Connect Lovable: `npm run lovable:auth`. Open the printed authorization URL. The local callback verifies OAuth state and saves client credentials/tokens to the ignored `.env.local`. Choose a workspace with permission to create and deploy projects; set `LOVABLE_WORKSPACE_ID` when your account has multiple workspaces. MCP authentication uses **OAuth**, not an API key. Token refresh requires a writable `.env.local`; revoked/expired authorization needs the login command again.
4. Run `npm run doctor`. This checks every available integration independently: Docker, Chromium, all eleven tables, bucket privacy, sender verification, Whop account, Lovable/Terac contracts, OpenAI model access, Google Geocoding/Places, Exa search and Resend authentication. Missing dependencies skip only their own checks. It creates no run, websites, listings, sales tasks or emails; Google/Exa probes can consume API quota. Exit code 1 means setup is incomplete or a check failed.
5. Start `npm run dev` and **in another terminal** `npm run worker`. Open [localhost:3000](http://localhost:3000), start a run. The dashboard reads persisted records every five seconds. New run opens the configuration form; execution stays disabled until all required values are present and valid. Local dashboard access works with a local APP_URL; execution requires a public HTTPS APP_URL for salesperson and buyer links. Revenue and estimated spending show daily UTC totals for the last seven days; pipeline bars show recorded discovery, qualification, builds, listings, sales assignments, and deliveries. Internal purchases are excluded from revenue.

`npm run check` runs type checking, tests, and a production build. `npm run test:browser` then checks direct dashboard access, persisted API records with incomplete configuration, business details, keyboard access, configuration gating, empty states, fetch errors and salesperson reports against a temporary local server; screenshots go to ignored `artifacts/`. The repository includes a local Node 22 development executable because older system Node releases cannot run current provider SDKs. Use Node 22 for installation and production as well.

To deliberately build for a discovered business, open its map/detail panel and choose **Build a concept for this business**. The confirmation form skips discovery, caps the selection at one build, and labels it explicitly. The worker preserves the real audit score; it requires a verified identity/address, sourced contacts, positive estimated economics, and at least two measured defects for a site classified as good. It refuses any business with a prior build record or billable build reservation. Selecting it moves the lead into the new run while preserving its earlier event history. Automatic selection keeps its original poor/no-website threshold.

For a run that must demonstrate both outreach channels, enable **Require both a sourced email and phone before building** in New run (`requireEmailAndPhone: true` in the API). Both outreach caps must be at least one. Businesses without both contacts and their source URLs remain visible on the map but are excluded from builds, with an explicit timeline reason. The option is off by default so ordinary runs can still use one contact channel. It cannot guarantee discovery of a qualifying business or successful provider delivery.

Lovable projects are saved before the worker waits for generation. The worker polls `get_message.response.status`, then checks `get_project.project.agentFinished` and the committed preview before auditing. Scaffold provisioning status alone never establishes build completion. Each repair follows the same wait. Human-input/approval pauses, stopped/failed builds and the 15-minute wait limit stop that business before listing or outreach; no paid generation command is replayed automatically. Inspect the persisted Lovable project before recovery.

Source export follows `list_files.data` and `pagination.next_cursor` to completion using the final build's immutable commit SHA for every listing and read. It rejects revision changes, repeated cursors, duplicate/unsafe paths, incomplete pages, binary assets and truncated or secret-containing text. Limits are 100 pages, 1,000 files and 25 MiB of source. Raw JSON files retain their complete original text. Only then does the existing isolated Docker build and private ZIP upload proceed. No schema migration is needed for the new run option; run settings are stored in the existing JSON parameters.

## Business map

The discovery map opens on **Williamsburg, Brooklyn** above the dashboard metrics. Choose a neighborhood from existing runs, filter by website status, and click a marker or business name to open the right-hand inspector. Green means good website, yellow means poor website, red means no website, and gray means pending/needs review. Colors use the latest recorded audit; the presence of a website alone never establishes its quality. Run and table filters also constrain map results. “Search this area” opens the existing run form with that neighborhood prefilled; starting a run still requires configured integrations and explicit spending limits. Google discovery returns up to 20 places per nearby request, so markers represent discovered records rather than an exhaustive directory.

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to a **separate browser key** with Maps JavaScript API and Geocoding API enabled and billing configured. Restrict its HTTP referrers to your local and production origins and restrict its APIs. Never put the server `GOOGLE_MAPS_API_KEY` in a public variable. Optionally set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` to your Google map ID; development uses Google's `DEMO_MAP_ID` by default. Restart development or rebuild production after changing public environment variables. See [Google's marker setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker).

Live marker locations are resolved from persisted Google place IDs, with four concurrent requests and in-memory reuse for the mounted map; coordinates are not persisted. Failed lookups remain counted as unlocated rather than being assigned invented positions. Without a browser key, the map displays connection instructions. No illustrative markers or sample businesses are substituted. The full inspector retains audit findings, source contacts, economics, generated sites, sales, delivery recovery, verified facts, and timeline.

## Provider setup

| Integration | Setup                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Maps | Enable Geocoding API and Places API (New), billing, and server API-key restrictions. Geocoding resolves the area; nearby search uses narrow masks and returns at most 20 results per request. `maxBusinesses` is a ceiling, not a guarantee. Google names/addresses are transient research hints. Persisted identities, facts and contact provenance come from independent Exa sources; place IDs support deduplication. |
| Exa         | Search + text contents API key. Each business receives an independent official-site/menu/contact search. Directory and social results are not automatically treated as an official site. Ambiguous/inaccessible sources require review. No contact guessing. A public business phone and source are required for a sales call.                                                                                           |
| OpenAI      | API key and a vision/structured-output capable model (`OPENAI_MODEL`). Used for sourced research, screenshot design scoring and generated-site factual checks. Provider content is treated as untrusted evidence.                                                                                                                                                                                                        |
| Lovable     | OAuth through `npm run lovable:auth`. Allow project creation, messaging, deployment and source inspection. The worker binds arguments to advertised MCP schemas and fails on unsupported contract changes. Use `doctor` to inspect them.                                                                                                                                                                                 |
| Terac       | Organization API key (`TERAC_API_KEY`) and project ID (`TERAC_PROJECT_ID`). Worker connects directly to `https://terac.com/api/mcp` using `x-api-key`. Set `TERAC_MAX_TASK_COST_USD` to an all-in per-assignment allowance. Public HTTPS `APP_URL` is required for the salesperson's brief/report page.                                                                                                                  |
| Whop        | Seller account ID, API key with account/product/variant/file/payment access and customer-email read permission. Uses SDK 2.x pinned to API date `2026-10-15-1`. One-time **variants** retain `plan_` identifiers; these are stored as `whop_plan_id`. Stock is one. Images are actual generated-site screenshots uploaded to Whop.                                                                                       |
| Resend      | Verified sender domain, domain ID, sending API key, real From address and sender identity. Sends the automated sales offer and buyer ZIP delivery emails. A valid physical sender address is required for commercial offers.                                                                                                                                                                                             |
| Supabase    | Project URL and service-role key. Apply the SQL first. Source ZIPs stay private. Screenshots are public for product media and operator comparison.                                                                                                                                                                                                                                                                       |

Set all provider cost estimates in `.env.local` from your plans. These are **estimates**, not exact billing. Reservations are recorded before paid operations and guarded transactionally against the run cap. Real provider billing can differ. The economics display the explicit conversion heuristic, fee assumption, proposed sale price, and estimated contribution. A negative contribution excludes generation.

## Terac sales handoff

For an existing installation, apply [`supabase/migrations/20261024_terac_sales.sql`](supabase/migrations/20261024_terac_sales.sql) once instead of rerunning the fresh schema. It adds phone provenance, sales costs and the sales queue, and retains sales emails with their exact subject, body and delivery status. Restart the web and worker processes after configuring Terac.

After published-site QA, source export and Whop storefront verification, the worker queues one salesperson assignment per business, up to `maxSalesTasks` per run. A sourced email enables automated sales email; a sourced public phone enables the Terac call. Either contact channel can qualify a business. The assignment includes the business facts and sources, original-site findings, deployed website, exact Whop product and checkout, price, and source-ZIP delivery terms. The automated email is attempted first; the caller receives its exact subject/body, recipient, provider acknowledgement and timestamp, or an explicit failed/not-sent status. Email and recruitment have independent caps and failure outcomes; neither failure blocks the other channel. The salesperson can refer to the email while making the call. No designer or second human review is added.

For businesses eligible for a call, the worker reserves the full sales allowance against the run cap before queueing. It creates a free draft, reads its all-in USD quote and funding status, and launches only within the reserved allowance. Estimated contribution subtracts the allowance whether or not the call converts. Spending charts retain that conservative reservation rather than pretending it is an invoice. A zero sales-task cap still permits sales emails; a zero email cap still permits sales calls.

The screened salesperson opens a signed `/sales/:id` brief, calls during the business's local opening hours, and submits their Terac submission ID, outcome and notes. The API verifies that submission belongs to the assignment. A do-not-call outcome suppresses the normalized phone for future assignments. The caller returns to Terac to mark completion; the worker approves submitted work after a matching call report exists. A call attempt/report is compensated even when the owner declines or does not answer. A self-reported purchase never counts as revenue: only the existing Whop webhook verifies payment and queues fulfillment.

Sales work runs independently of builds and buyer delivery. The dashboard shows task status, provider opportunity ID, quote, report and errors. `RUN_COMPLETED` means website processing finished; a sales assignment may still be recruiting. Terac availability and turnaround are not guaranteed by the app. The worker checks progress every 30 seconds; it does not block waiting for a person.

Unknown creation, launch or approval outcomes become `NEEDS_REVIEW`, with no automatic replay that could duplicate charges. Inspect Terac using the persisted opportunity ID before recovery. `npm run sales:reconcile -- TASK_UUID` reads provider state and resumes only a recognized draft, active opportunity or matched submitted report. If creation returned no ID, find the draft by internal title `Sidewalk sales TASK_UUID`, then use `--opportunity PROVIDER_ID` to attach it; the command verifies the internal title before attaching. A draft still above its reserved allowance remains unlaunched.

Terac's MCP and newer API documentation differ on pricing details. The adapter validates every supplied field against advertised MCP schemas and fails explicitly on unsupported contracts. `npm run doctor` must pass against your actual account before a live run. Local tests cannot prove recruitment, caller availability or payment acceptance.

The current MCP create contract uses explicit US, English-speaking, adult audience filters and a qualifying sales-experience/phone-capability screener. Qualified applicants are auto-invited; the call report still requires manual review before payment. The salesperson requirements are in the description and screener because `candidate_profile` is not writable through this API. The signed brief/report page uses Terac's URL-backed `interview` task type with the existing 20-minute estimate. Terac requires a minimum five-day recruitment window; this is the recruitment deadline, not a five-day assignment or a promise of immediate recruitment. After accepting, the caller is instructed to finish within 30 minutes during business hours. Captured live schemas under `tests/fixtures/` guard against the previous unsupported profile field and one-day window.

## Payment and delivery setup

Deploy the Next.js app behind HTTPS. Set `APP_URL` to its public origin. In Whop, register:

```text
POST https://YOUR_HOST/api/webhooks/whop
Event: payment.succeeded
API version date: 2026-10-15-1
```

Copy the endpoint's **unchanged `ws_…` signing secret** to `WHOP_WEBHOOK_SECRET`. The SDK validates the raw body, signature and timestamp. The server independently retrieves the payment, checks paid status, seller account, exact product/variant, amount, currency and authenticated buyer email. Unique payment/event IDs deduplicate orders. The webhook persists a durable order; the worker sends the delivery email independently of a long site build.

Buyers receive a seven-day capability link. Only its hash is stored in Postgres. The download endpoint checks expiration and redirects to a 60-second Supabase signed URL. The email includes the source checksum and deployment instructions. `DELIVERED` requires an acknowledged email send. Failed sends back off, with a retry button in the business inspector. Expired links can be renewed there; renewal rotates the token and email idempotency key. Retries preserve the order, download and email idempotency key. Ten unsuccessful automatic attempts leave the order visible for operator recovery.

Set `INTERNAL_BUYER_EMAILS` before an internal verification purchase. Such purchases appear as internal and are excluded from external revenue. No Stripe, domain handoff, buyer accounts or hosting service are included.

## Operation and failure behavior

- Builds are selected from actual audited opportunities: confirmed absent site, or score below 45 with at least two defects; at least three independently verified facts including a high-confidence location; sourced business email or phone; positive estimated contribution. Chains and ambiguous sources are excluded.
- One queued/running run is allowed. A database function atomically claims it. A heartbeat protects live work; a stale run fails instead of replaying billable creation calls. Inspect its persisted projects/products before starting another run. Places are deduplicated globally so already-processed businesses are not rebuilt by accident.
- Each run limits generation attempts, sales email attempts, salesperson assignments and estimated spending. Business IDs deduplicate assignments; ambiguous billable outcomes require reconciliation. Phone suppression is checked before assigning a caller.
- Browser audits use a mobile viewport and measured overflow, navigation, links, Lighthouse performance, screenshot-based visual quality and SEO weights. Browser/Lighthouse traffic goes through a public-network proxy. Failed audits retain `NEEDS_REVIEW`, never an invented score. A no-site score is `N/A`.
- Generated previews must show the business name, factual brief, unofficial notice and `noindex`, with functioning navigation and no clipped actions. Up to two repairs are allowed. Published output is checked again.
- Export uses complete MCP file reads. Path traversal, secrets and unsupported/binary assets fail export. All builds run `npm install && npm run build` in a resource-limited Docker container. The ZIP contains the original text source, lockfile and a deployment README, excluding dependencies and secrets. Failure blocks Whop creation.
- Whop products are individually created, published and checked for name, price, screenshot and checkout link. Failure blocks email and sales recruitment. A product created before validation failure remains visible in the inspector for recovery; it is never described as verified.
- Sales brief/report and download routes are public signed/capability endpoints. The dashboard and its APIs open directly without authentication. Mutations enforce the configured origin.

## Deploy

For the hackathon, use **Netlify Free for the UI/API and this Mac for the worker**. [`netlify.toml`](netlify.toml) runs the checks and production build on Node 22; Netlify supplies its Next.js adapter. Follow [`docs/deployment.md`](docs/deployment.md) for the branch selection, environment import, Whop webhook, public Maps key, read-only deployment check and sleep-safe local worker command. Both processes use the same Supabase project; no tunnel is required. Run `npm run verify:deployment -- https://YOUR_SITE.netlify.app` after deploying.

A single-host alternative is one Node 22 VPS running the web process and **one worker process**, with managed Supabase. Install Docker and Chromium's OS dependencies (`npx playwright install --with-deps chromium`), run `npm ci && npm run build`, then supervise `npm start` and `npm run worker` with systemd or your process manager. Keep `.env.local` readable only by the app user. Configure the reverse proxy for HTTPS, point `APP_URL` at that origin, and run `npm run doctor` on the worker host.

The web app can also run on a Node-compatible Next.js host while the worker stays on the VPS. Both must use the same environment secrets and Supabase project. The worker is persistent; do not put it in a short-lived serverless handler. Do not run generated npm commands directly in the application process.

## API

Dashboard endpoints do not require authentication. Errors are explicit JSON; no successful-looking fallbacks are returned.

| Endpoint                                         | Purpose                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `GET /api/config`                                | Missing/invalid configuration names and reasons, never values |
| `POST /api/runs`                                 | Validate and queue geographic inputs/caps                     |
| `GET /api/runs`, `GET /api/runs/:id`             | Runs and persisted event timeline                             |
| `GET /api/businesses`, `GET /api/businesses/:id` | Ranked facts, audits, source/commerce/delivery details        |
| `GET /api/overview`                              | Persisted activity and order metrics                          |
| `POST /api/webhooks/whop`                        | Signature-verified payment ingestion                          |
| `GET /api/download/:token`                       | Buyer-authorized expiring source download                     |
| `GET/POST /api/opt-out/:id?signature=…`          | Signed suppression of future sales offers                     |
| `GET/POST /api/sales/:id?signature=…`            | Signed salesperson brief and validated call report            |
| `POST /api/orders/:id/retry`                     | Failed-delivery retry                                         |

## Verification

`npm test` covers classification thresholds, missing-site scoring, fee/economics arithmetic, input limits, unsafe export paths, direct dashboard access, webhook signatures/tampering, public URL restrictions, MCP argument contracts, and actual PostgreSQL semantics through PGlite. Database tests execute the production schema (with Supabase storage/roles supplied locally), exercise transactional caps and claims, unique payment/place constraints, RLS and private storage configuration. Orchestrator regression tests isolate provider adapters to prove that failed QA, failed export, invalid storefronts, missing contacts and independent email/sales-task caps block later actions. These tests do not require provider credentials or claim real provider acceptance.

After configuration, run a real small run and open its previews, Whop products and Terac sales reports. Complete a genuine Whop checkout, then inspect automatic fulfillment and unpack/build the delivered ZIP. Run `npm run verify:live` to check persisted real evidence, two distinct validated archives, their storage checksums, exact storefronts, acknowledged sales emails, accepted call reports and paid Whop records. This command fails if the evidence is absent.

**Live acceptance remains unverified until preflight passes, two actual sites are generated, a real Terac call report is accepted and a genuine purchase reaches the signed webhook.** Local tests and a successful app build cannot establish those facts.

Integration references: [Lovable MCP](https://docs.lovable.dev/integrations/lovable-mcp-server), [Whop current Products](https://docs.whop.com/api-reference/beta/products/create-product), [Whop Variants](https://docs.whop.com/api-reference/beta/variants/create-variant), [Whop webhooks](https://docs.whop.com/developer/guides/webhooks), [Exa Search](https://exa.ai/docs/reference/search), [Google Places](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Google data policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Terac MCP](https://terac.com/docs/researchers/mcp).

### Environment preflight limits

`doctor` reports fixed diagnostic categories and variable names without printing secret values. It validates required URL, numeric, sender, signing-secret and OAuth-token formats before execution. It also flags a missing browser Maps key. Run blocking configuration includes public HTTPS `APP_URL`, unchanged Whop `ws_` webhook secret, verified Resend sender/domain, physical sender address and Terac organization key/project. Optional Lovable client secret/workspace and Google map ID remain optional. Set the browser Maps key separately with referrer restrictions; never copy the server key into a public variable.

A passed read-only check proves only the operation it tested. Model lookup does not prove structured/vision generation; Places details does not prove Nearby Search permission; MCP tool listing does not prove creation/deployment or funding; account access does not prove Whop write permissions or payment delivery. Resend domain inspection requires a full-access key (a send-only key cannot pass domain verification). Browser Maps restrictions require a browser check. Provider writes and end-to-end fulfillment remain for the explicitly authorized live run and genuine checkout.

If a run fails **before any website build or outreach was attempted**, stop its original worker and run `node --import tsx scripts/retry-prebuild.ts <run-id>` on the worker host. The command atomically claims only a failed run, checks both downstream records and reserved build events to prevent replaying an ambiguous provider write, preserves its history, and refreshes research/audits in place. The original estimated spending cap includes earlier attempts. It refuses to retry after any site, email, sales task, or billable build reservation exists; inspect provider state in those cases. Use the normal worker afterward for salesperson updates and order delivery.
