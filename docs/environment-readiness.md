# Environment readiness — October 24, 2026

**Read-only preflight passes; a complete live business run is still unverified.** The current Lovable build-waiting, paginated source-export and dual-contact selection fixes are local changes and need deployment before using the new run option in the hosted UI. No paid run, site generation, product listing, recruitment or email send was started during these checks.

## Verified

- The hosted dashboard and configuration/runs/businesses/overview APIs pass `verify:deployment` at `https://sidewalkai.netlify.app`.
- The hosted Google map loads without observed Maps errors. The last database inspection found zero runs, businesses, sites, products, outreach emails and sales assignments.
- All eleven required Supabase tables are accessible. The source ZIP bucket is private and the screenshot bucket is public.
- Docker, Playwright Chromium, Lovable OAuth, Terac authentication/contracts, Whop account access, OpenAI model lookup, Google Geocoding/Places, Exa and Resend checks pass.
- `mail.rerout.com` is verified, the sender matches it, and the sender postal address is configured locally and in Netlify.
- The strengthened Lovable preflight checks availability and argument binding for creation, repairs, message polling, deployment and paginated source reads. It never executes the write operations.
- `npm run check` passes: route generation, type checking, **151 tests** and the production build. The browser suite passes, including the new dual-contact option and salesperson reporting.
- A separate two-second local recording test exported successfully to H.264 MP4. That technical test is not the requested three-minute demo.

## Before the real demo

1. Deploy these changes and restart the Mac worker when a paid run is authorized. No database migration is required.
2. Choose the geographic search and explicit spending limits. Enable **Require both a sourced email and phone before building** for the full email-plus-caller demonstration, with both outreach caps at least one.
3. Confirm a real qualifying business is discovered. If none qualifies, the run reports that result without inventing records, contacts or successful outreach.
4. Verify actual Lovable generation/publication, complete source export and Docker build, Whop listing, acknowledged outreach email, and a funded Terac assignment within the configured allowance.
5. Record the real hosted workflow and transparently edit waiting time into the requested three-minute video. Caller availability is not guaranteed.

## Limits

Read-only checks do not establish provider write permissions, sufficient generation/recruitment credits, actual inbox receipt, caller completion, webhook delivery or successful buyer fulfillment. A genuine Whop checkout and worker delivery are still required to prove purchase-to-ZIP fulfillment. No end-to-end acceptance is claimed. Google/Exa diagnostic probes may use API quota; secret values are never printed.
