# Sidewalk AI

An autonomous local website agency: Google Places → independent Exa research → real browser audit → Lovable → clean source ZIP → individual Whop product → real email → verified payment → automatic private ZIP delivery.

Next.js operator dashboard, one persistent TypeScript worker, Supabase Postgres/Storage. When integrations are missing, the dashboard displays labeled sample data from `data/dashboard-demo.json`. Demo records stay in the UI; the worker and APIs still require real configuration and never simulate provider successes.

## Start locally

Requirements: **Node.js 22.19+**, npm, Docker with its daemon running. Docker builds generated code in disposable containers without application secrets. The worker must run on the Docker host so its temporary build directory can be mounted.

```sh
nvm use
npm ci
npx playwright install chromium
cp .env.example .env.local
```

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL editor. It creates nine tables, transactional run/cost functions, a private `website-zips` bucket and a public screenshot bucket. Keep the ZIP bucket private. Table RLS grants no browser access; the service-role key stays server-side.
2. Fill `.env.local` using the notes below. Use a long random download-signing secret. Do not prefix secrets with `NEXT_PUBLIC_`.
3. Connect Lovable: `npm run lovable:auth`. Open the printed authorization URL. The local callback verifies OAuth state and saves client credentials/tokens to the ignored `.env.local`. Choose a workspace with permission to create and deploy projects; set `LOVABLE_WORKSPACE_ID` when your account has multiple workspaces. MCP authentication uses **OAuth**, not an API key. Token refresh requires a writable `.env.local`; revoked/expired authorization needs the login command again.
4. Run `npm run doctor`. This checks Docker, Chromium, schema, bucket privacy, the verified sender, Whop account, and the actual Lovable tool schemas without creating products or sending email.
5. Start `npm run dev` and **in another terminal** `npm run worker`. Open [localhost:3000](http://localhost:3000), start a run. The dashboard reads persisted provider events every five seconds when all integrations are configured. Before setup, explore the JSON demo with the same charts, filters, and business details. New run opens the configuration form; execution stays disabled until integrations are connected. Revenue and estimated spending show daily UTC totals for the last seven days; pipeline bars show recorded discovery, qualification, builds, listings, outreach, and deliveries. Internal purchases are excluded from revenue.

`npm run check` runs type checking, tests, and a production build. `npm run test:browser` then checks direct dashboard access, JSON demo data, grayscale styling, charts, search, run and website filters, business details, keyboard access, configuration gating, live empty states, fetch errors and 375/390 px layouts against a temporary local server; screenshots go to ignored `artifacts/`. The repository includes a local Node 22 development executable because older system Node releases cannot run current provider SDKs. Use Node 22 for installation and production as well.

## Provider setup

| Integration | Setup                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Maps | Enable Geocoding API and Places API (New), billing, and server API-key restrictions. Geocoding resolves the area; nearby search uses narrow masks and returns at most 20 results per request. `maxBusinesses` is a ceiling, not a guarantee. Google names/addresses are transient research hints. Persisted identities, facts and contact provenance come from independent Exa sources; place IDs support deduplication. |
| Exa         | Search + text contents API key. Each business receives an independent official-site/menu/contact search. Directory and social results are not automatically treated as an official site. Ambiguous/inaccessible sources require review. No email guessing.                                                                                                                                                               |
| OpenAI      | API key and a vision/structured-output capable model (`OPENAI_MODEL`). Used for sourced research, screenshot design scoring and generated-site factual checks. Provider content is treated as untrusted evidence.                                                                                                                                                                                                        |
| Lovable     | OAuth through `npm run lovable:auth`. Allow project creation, messaging, deployment and source inspection. The worker binds arguments to advertised MCP schemas and fails on unsupported contract changes. Use `doctor` to inspect them.                                                                                                                                                                                 |
| Whop        | Seller account ID, API key with account/product/variant/file/payment access and customer-email read permission. Uses SDK 2.x pinned to API date `2026-10-15-1`. One-time **variants** retain `plan_` identifiers; these are stored as `whop_plan_id`. Stock is one. Images are actual generated-site screenshots uploaded to Whop.                                                                                       |
| Resend      | Verified sender domain, domain ID, sending API key, real From address, sender identity and valid physical postal address. The worker verifies sender-domain status before outreach. Email provider acknowledgement is labeled `SENT`; it is not a claim of inbox receipt.                                                                                                                                                |
| Supabase    | Project URL and service-role key. Apply the SQL first. Source ZIPs stay private. Screenshots are public for product media and operator comparison.                                                                                                                                                                                                                                                                       |

Set all provider cost estimates in `.env.local` from your plans. These are **estimates**, not exact billing. Reservations are recorded before paid operations and guarded transactionally against the run cap. Real provider billing can differ. The economics display the explicit conversion heuristic, fee assumption, proposed sale price, and estimated contribution. A negative contribution excludes generation.

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

- Builds are selected from actual audited opportunities: confirmed absent site, or score below 45 with at least two defects; at least three independently verified facts including a high-confidence location; sourced contact; positive estimated contribution. Chains and ambiguous sources are excluded.
- One queued/running run is allowed. A database function atomically claims it. A heartbeat protects live work; a stale run fails instead of replaying billable creation calls. Inspect its persisted projects/products before starting another run. Places are deduplicated globally so already-processed businesses are not rebuilt by accident.
- Each run limits generation attempts, real email attempts and estimated spending. Unknown email outcomes consume the send limit conservatively. Suppression is checked by recipient address before outreach; signed opt-out links take effect immediately.
- Browser audits use a mobile viewport and measured overflow, navigation, links, Lighthouse performance, screenshot-based visual quality and SEO weights. Browser/Lighthouse traffic goes through a public-network proxy. Failed audits retain `NEEDS_REVIEW`, never an invented score. A no-site score is `N/A`.
- Generated previews must show the business name, factual brief, unofficial notice and `noindex`, with functioning navigation and no clipped actions. Up to two repairs are allowed. Published output is checked again.
- Export uses complete MCP file reads. Path traversal, secrets and unsupported/binary assets fail export. All builds run `npm install && npm run build` in a resource-limited Docker container. The ZIP contains the original text source, lockfile and a deployment README, excluding dependencies and secrets. Failure blocks Whop creation.
- Whop products are individually created, published and checked for name, price, screenshot and checkout link. Failure blocks outreach. A product created before validation failure remains visible in the inspector for recovery; it is never described as verified.
- Opt-out and download routes are public signed/capability endpoints. The dashboard and its APIs open directly without authentication. Mutations enforce the configured origin.

## Deploy

The smallest deployment is one Node 22 VPS running the web process and **one worker process**, with managed Supabase. Install Docker and Chromium's OS dependencies (`npx playwright install --with-deps chromium`), run `npm ci && npm run build`, then supervise `npm start` and `npm run worker` with systemd or your process manager. Keep `.env.local` readable only by the app user. Configure the reverse proxy for HTTPS, point `APP_URL` at that origin, and run `npm run doctor` on the worker host.

The web app can also run on a Node-compatible Next.js host while the worker stays on the VPS. Both must use the same environment secrets and Supabase project. The worker is persistent; do not put it in a short-lived serverless handler. Do not run generated npm commands directly in the application process.

## API

Dashboard endpoints do not require authentication. Errors are explicit JSON; no successful-looking fallbacks are returned.

| Endpoint                                         | Purpose                                                |
| ------------------------------------------------ | ------------------------------------------------------ |
| `GET /api/config`                                | Missing configuration names, never values              |
| `POST /api/runs`                                 | Validate and queue geographic inputs/caps              |
| `GET /api/runs`, `GET /api/runs/:id`             | Runs and persisted event timeline                      |
| `GET /api/businesses`, `GET /api/businesses/:id` | Ranked facts, audits, source/commerce/delivery details |
| `GET /api/overview`                              | Persisted activity and order metrics                   |
| `POST /api/webhooks/whop`                        | Signature-verified payment ingestion                   |
| `GET /api/download/:token`                       | Buyer-authorized expiring source download              |
| `GET/POST /api/opt-out/:id?signature=…`          | Signed recipient suppression                           |
| `POST /api/orders/:id/retry`                     | Failed-delivery retry                                  |

## Verification

`npm test` covers classification thresholds, missing-site scoring, fee/economics arithmetic, input limits, unsafe export paths, direct dashboard access, webhook signatures/tampering, public URL restrictions, MCP argument contracts, and actual PostgreSQL semantics through PGlite. Database tests execute the production schema (with Supabase storage/roles supplied locally), exercise transactional caps and claims, unique payment/place constraints, RLS and private storage configuration. Orchestrator regression tests isolate provider adapters to prove that failed QA, failed export, invalid storefronts, missing contacts and send caps block later actions. These tests do not require provider credentials or claim real provider acceptance.

After configuration, run a real small run and open its previews, Whop products and sent-email records. Complete a genuine Whop checkout, then inspect automatic fulfillment and unpack/build the delivered ZIP. Run `npm run verify:live` to check persisted real evidence, two distinct validated archives, their storage checksums, exact storefronts, acknowledged emails and paid Whop records. This command fails if the evidence is absent.

**Live acceptance remains unverified until credentials are supplied, two actual sites are generated, outreach is acknowledged and a genuine purchase reaches the signed webhook.** Local tests and a successful app build cannot establish those facts.

Integration references: [Lovable MCP](https://docs.lovable.dev/integrations/lovable-mcp-server), [Whop current Products](https://docs.whop.com/api-reference/beta/products/create-product), [Whop Variants](https://docs.whop.com/api-reference/beta/variants/create-variant), [Whop webhooks](https://docs.whop.com/developer/guides/webhooks), [Exa Search](https://exa.ai/docs/reference/search), [Google Places](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Google data policies](https://developers.google.com/maps/documentation/places/web-service/policies), [CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
