# CropDoc

Demo URL: https://cropdoc-lilac.vercel.app

See [deployment verification](VERIFICATION.md) for completed checks and the two remaining service-configuration blockers.

A small crop-photo analysis app for Indian growers. Next.js + TypeScript, Clerk, Supabase Postgres/Storage, and the OpenAI Responses API. Includes a Python/USB camera uploader.

## Run locally

Requires Node 22+, npm, and Python 3.10+ for the device client.

```sh
npm ci
cp .env.example .env.local
# Fill in the environment values below.
npm run dev
```

Open http://localhost:3000. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Python tests: `python -m unittest discover -s device-client -v` after installing its requirements.

## Services

1. **Clerk:** create a consumer application with Google, email/password, and email-code login. Enable email verification. Put its publishable and secret keys in `.env.local`. Activate the native Supabase integration at https://clerk.com/setup/supabase to add `role: authenticated` to session tokens.
2. **Supabase:** create a dedicated project. Enable Clerk in Authentication → Third-Party Auth using the exact Clerk frontend domain. Copy the project URL, publishable/anon key, and server-only service-role key. Do not use the deprecated Clerk Supabase JWT template.
3. **Database:** install/login to the Supabase CLI, then `supabase link --project-ref YOUR_REF` and `supabase db push`. Migrations create all tables, private `crop-images` Storage, grants, policies, and atomic functions. Replace the Clerk domain in `supabase/config.toml` for your instance. Local Supabase requires Docker; hosted migrations and `supabase db query --linked` do not.
4. **OpenAI:** create a restricted project API key with Responses access and `gpt-5.6-luna` access. Set `OPENAI_API_KEY`; no other model is automatically selected. Add a provider project spending limit as a secondary guard when supported.
5. **Clerk webhook:** add `https://YOUR_APP/api/webhooks/clerk`, subscribe to `user.deleted`, and set `CLERK_WEBHOOK_SIGNING_SECRET`. Failed cleanup returns an error for webhook retry. `/api/health` returns 503 if required configuration is missing.

Only `NEXT_PUBLIC_*` values belong in the browser. Never put Clerk secrets, Supabase service-role keys, or OpenAI keys on a device or in Git. Local credentials are ignored.

## Deploy

```sh
gh repo create YOUR_ACCOUNT/cropdoc --private --source=. --remote=origin
vercel link
# Add .env.local values using `vercel env add NAME production`.
# Set NEXT_PUBLIC_APP_URL to the deployment's stable public URL.
vercel --prod
```

Use Vercel's Git integration for subsequent deployments. This demo uses a free `vercel.app` URL and **Clerk development credentials**. A production Clerk instance requires your own domain, production OAuth configuration, production keys, and an updated Supabase trusted issuer. Development users are not automatically migrated to production. Hosting remains on free tiers; there is no automatic paid upgrade.

The GitHub workflow needs the three public Clerk/Supabase values configured as repository variables. Database tests run explicitly with a linked dedicated project and `.env.local`: `npm run test:db`. They use rolled-back SQL and temporary test rows; no OpenAI calls. Do not run integration fixtures against an unrelated production database.

## Behavior and limits

- One report per photo or one grouped report from up to four views of the same plant. Different plants should use individual reports.
- JPEG/PNG/WebP up to 20 MB are optimized locally to JPEG under 750 KB and a 1600-pixel longest edge. Only optimized photos are retained. API uploads are limited to 800 KB per image, 3.5 MB per request, four images, and 20 million decoded pixels. Animated/invalid images are rejected.
- Reports have exactly nine structured fields and at most 110 words (prompt target: under 100). Confidence is qualitative, not a calibrated probability. Optional remedies/expert notes are nullable. Uncertainty and inability to assess are valid outcomes.
- Five paid analysis attempts per account per India-calendar day, shared by all devices. A $1 **total, non-resetting demo budget** lives in `ai_budget`. Each attempt reserves $0.05 atomically before calling OpenAI. Recorded token costs settle the reservation; unknown charges retain the reservation. No hidden SDK retries.
- GPT-5.6 Luna standard pricing used for accounting: $0.20/million input tokens and $1.20/million output tokens, verified September 2026. Cached inputs are conservatively counted at full input price. Requests have 1,500 output tokens maximum and no tools. Reverify pricing before changing the model or scaling the cap.
- Up to 100 retained inspections and ten active device tokens per user. Up to two simultaneous upload/analysis leases. Delete old reports or revoke tokens to free capacity.
- Analysis runs within a bounded HTTP request, without a worker. A 120-second processing lease makes interrupted work explicitly retryable. A lost response does not immediately trigger a duplicate paid call. The CLI persists idempotency state and checks the same inspection before requesting an explicit retry.
- Files and reports remain until deletion. Deletion removes Storage objects before tracking rows. Account deletion denies subsequent access, revokes tokens, and cleans data through verified webhook retries. Aggregate budget usage is preserved.

## Security and data flow

Browser/CLI → authenticated Next.js API → private Supabase Storage → OpenAI image input → validated report → Supabase.

Normal web reads carry a verified Clerk session token through Supabase RLS. Policies match `auth.jwt()->>'sub'` to indexed text ownership IDs. Composite foreign keys prohibit attaching images/reports to another user's inspection. Client roles cannot write reports, quotas, token digests, or processing state. Server-only mutations check ownership and use restricted atomic functions; only the server has the service key.

Tokens have 256 random bits, are shown once, and only SHA-256 digests are stored. A device can upload and read/retry inspections it created; it cannot browse web uploads, other devices' reports, manage tokens, or delete records. Signed image URLs expire after five minutes and are bearer links during that interval. Avoid sharing them. OpenAI receives normalized images and optional context with `store:false`; standard provider retention policies still apply.

## API

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `POST /api/inspections` | Clerk | Multipart upload: `images`, optional `crop`, `location`, `notes`; required `Idempotency-Key` |
| `GET /api/inspections?page=0` | Clerk | Newest reports, 20 per page |
| `GET/DELETE /api/inspections/:id` | Clerk | Own report or deletion |
| `POST /api/inspections/:id/analyze?retry=1` | Clerk | Analysis; explicit retry for failed/stale attempts |
| `GET/POST /api/devices` | Clerk | List token metadata or create a token with JSON `{name}` |
| `DELETE /api/devices/:id` | Clerk | Revoke a token |
| `POST /api/device/upload` | Bearer device token | Same multipart upload, followed by analysis |
| `GET/POST /api/device/inspections/:id` | Same device token | Status/report or explicit analysis retry |
| `POST /api/webhooks/clerk` | Verified webhook signature | Account-deletion cleanup |

Errors use `{error: {code, message}}`. Daily/budget/storage limits return 429; invalid/revoked tokens return 401; inaccessible reports return 404. Retry transport failures and transient 5xx with bounded backoff; stop on permanent errors or budget exhaustion. Never follow an API redirect with a device credential.

Device setup: [device-client/README.md](device-client/README.md).
