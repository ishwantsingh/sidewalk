# Environment readiness — October 24, 2026

**Dashboard running; full pipeline not ready.** This recheck used the current `.env.local`. The development server is running at <http://localhost:3000>. The worker is not running and configuration checks block startup. No run, build, product listing, recruitment, sales email, delivery or checkout was initiated. Google/Exa diagnostic probes may use API quota. No secret values are included here, and no environment values were changed during this recheck.

## Verified against configured services

- Real Google Maps loads in Chromium with Williamsburg, Brooklyn selected, visible map imagery and no observed Google Maps authentication errors.
- Dashboard `/api/config`, `/api/runs`, `/api/businesses` and `/api/overview` return HTTP 200. The database currently contains zero runs, businesses, orders and events; the empty map and metrics reflect those responses.
- All eleven required Supabase tables are accessible, including `sales_tasks` and `sales_suppressions`.
- Source bucket exists and is private; screenshot bucket exists and is public.
- Docker daemon and Playwright Chromium work.
- Lovable OAuth connects and advertises all six required MCP tools.
- OpenAI credentials can retrieve the configured model.
- Google Geocoding accepts the server key.
- Whop account lookup succeeds.
- Exa accepts a minimal search request.
- Resend API access to list domains succeeds. Sender-domain verification remains blocked by missing sender settings.

## Remaining blockers

| Blocker                                                                | Action                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Places API (New) disabled                                       | Enable Places API (New) in the Google Cloud project owning the server key and allow it in the key's API restrictions. Recheck after propagation.                            |
| `APP_URL` missing                                                      | Set the deployed public HTTPS origin used for salesperson briefs, buyer downloads and webhook registration.                                                                 |
| `TERAC_API_KEY`, `TERAC_PROJECT_ID`, `TERAC_MAX_TASK_COST_USD` missing | Configure the Terac organization/project and assignment allowance. The Terac MCP sales contract has not been checked because these and the public-link settings are absent. |
| `WHOP_WEBHOOK_SECRET` missing                                          | Register the `payment.succeeded` endpoint at `APP_URL/api/webhooks/whop` and store its unchanged `ws_…` signing secret.                                                     |
| `EMAIL_FROM`, `RESEND_DOMAIN_ID`, `SENDER_POSTAL_ADDRESS` missing      | Configure the verified sending domain, sender email and physical postal address. Domain verification has not been checked.                                                  |
| `DOWNLOAD_SIGNING_SECRET` missing                                      | Set a random signing secret of at least 32 characters for private download and signed sales links.                                                                          |

`npm run doctor` currently exits unsuccessfully with the nine missing settings above and the Places API failure. The dashboard and browser map can operate independently of full pipeline readiness. Rerun the diagnostic after resolving these blockers.

## Validation and limits

`npm run check` passed: type checking, all **102 tests**, and the production build. `npm run test:browser` passed for persisted records, business details, keyboard access, configuration gating, live empty states, fetch errors and salesperson handoff/report. A separate browser check loaded the real Google map and read the actual local API responses; its screenshot is saved to ignored `artifacts/configured-dashboard.png`.

Read-only preflight does not establish provider creation permissions, model vision/structured generation, Nearby Search acceptance, Terac funding/caller availability, webhook delivery or successful purchase fulfillment. Those require a later authorized live run and genuine checkout. Classified markers and their live audit details remain unverified because no business records exist yet. No end-to-end live acceptance is claimed.
