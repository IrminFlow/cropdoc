# CropDoc

Demo URL: https://cropdoc-lilac.vercel.app

See [deployment verification](VERIFICATION.md) for completed checks and remaining service-configuration blockers.

A small crop-photo analysis app for Indian growers. Next.js + TypeScript, Clerk, Supabase Postgres/Storage, and the Gemini Interactions API. Includes a Python/USB camera uploader.

## Screens

Built for growers who may not read easily, on a phone, outdoors: large type, strong contrast, big buttons, and every colour paired with an icon and a plain word. Phones get a bottom tab bar (**Check crop**, **My reports**, **Help**); wider screens get the same links in the header.

- **Welcome** (`/`): signed-out visitors see what CropDoc does in three pictured steps, then **Start for free** or **Sign in**. Signed-in visitors go straight to Check crop.
- **Check crop** (`/upload`): one mustard "viewfinder" panel with **Take a photo** and **Choose from gallery** (up to four photos). With more than one photo it asks whether they show the same plant (one report) or different plants (one report each). Crop name, place and notes are optional and folded away. The page also shows checks left today, photo tips and the latest reports.
- **Report** (`/reports/:id`): the photo, then a colour-coded verdict (looks healthy, small, medium or serious problem, or not sure), a four-step severity gauge, the possible problem and how sure the AI is, **Listen to report** (read aloud by the phone's own voice), **What to do now**, the other advice, and a button to call the free Kisan helpline (1800-180-1551). While a check runs, a scan line sweeps across the photo.
- **My reports** (`/reports`): newest first, with photo thumbnails and verdict chips. **Show older reports** loads more.
- **Help** (`/help`): the steps (with **Listen**), good and bad photos, the helpline, limits and privacy, and a link to **Field cameras** (`/devices`) for Raspberry Pi or USB camera keys.

Old `/dashboard` links redirect to Check crop. The web app manifest lets growers add CropDoc to their home screen.

Design: Bricolage Grotesque headings with Geist body text, deep forest green with one fresh lime accent for the main action, Phosphor icons, and light and dark themes that follow the phone's setting. Photos are real crop and farm photography in `src/assets/photos/` (Unsplash License; see `src/assets/photos/CREDITS.md`), served through `next/image`. Anything you press is a pill; photos and panels use 24px corners.

Styles: design tokens and shared building blocks (buttons, fields, verdict colours, skeleton loaders, the viewfinder corners) are in `src/app/globals.css`; each screen keeps its own CSS module next to its component. Plain-language wording for verdicts lives in `src/lib/verdict.ts`, and shared limits in `src/lib/limits.ts`.

## Run locally

Requires Node 22.x, npm, and Python 3.10+ for the device client.

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
4. **OpenRouter, strictly free:** create a dedicated CropDoc API key at [OpenRouter](https://openrouter.ai/settings/keys). Do not buy credits or enable automatic recharge. Set server-only `OPENROUTER_API_KEY` and `OPENROUTER_MODEL=dots-studio/dots-3-note-preview:free`. Verify a real image request succeeds with zero reported cost before setting `OPENROUTER_FREE_TIER_VERIFIED=true`. Requests pin this free model, forbid paid input/output prices and provider fallbacks, and exclude providers that train on submitted data. Missing or unverified configuration blocks analysis. No Google or OpenAI key is needed.
5. **Clerk webhook:** add `https://YOUR_APP/api/webhooks/clerk`, subscribe to `user.deleted`, and set `CLERK_WEBHOOK_SIGNING_SECRET`. Failed cleanup returns an error for webhook retry. `/api/health` returns 503 if required configuration is missing.

Only `NEXT_PUBLIC_*` values belong in the browser. Never put Clerk secrets, Supabase service-role keys, or Gemini keys on a device or in Git. Local credentials are ignored.

## Deploy

```sh
gh repo create YOUR_ACCOUNT/cropdoc --private --source=. --remote=origin
vercel link
# Add .env.local values using `vercel env add NAME production`.
# Set NEXT_PUBLIC_APP_URL to the deployment's stable public URL.
vercel --prod
```

Use Vercel's Git integration for subsequent deployments. This demo uses a free `vercel.app` URL and **Clerk development credentials**. A production Clerk instance requires your own domain, production OAuth configuration, production keys, and an updated Supabase trusted issuer. Development users are not automatically migrated to production. Hosting remains on free tiers; there is no automatic paid upgrade.

The GitHub workflow needs the three public Clerk/Supabase values configured as repository variables. Database tests run explicitly with a linked dedicated project and `.env.local`: `npm run test:db`. They use rolled-back SQL and temporary test rows; no AI provider calls. Do not run integration fixtures against an unrelated production database.

## Behavior and limits

- One report per photo or one grouped report from up to four views of the same plant. Different plants should use individual reports.
- JPEG/PNG/WebP up to 20 MB are optimized locally to JPEG under 750 KB and a 1600-pixel longest edge. Only optimized photos are retained. API uploads are limited to 800 KB per image, 3.5 MB per request, four images, and 20 million decoded pixels. Animated/invalid images are rejected.
- Reports have exactly nine structured fields and at most 110 words (prompt target: under 100). Confidence is qualitative, not a calibrated probability. Optional remedies/expert notes are nullable. Uncertainty and inability to assess are valid outcomes.
- Five analysis attempts per account per India-calendar day, shared by web and devices, including failures and explicit retries. Google free-tier limits also apply. Provider exhaustion returns `AI_QUOTA`; the inspection is saved and automatic CLI retries stop. Saved history remains available.
- OpenRouter Dots3-Note Preview Free records `provider=openrouter`, the fixed model, and zero cost for new attempts. Historical provider records and the old financial ledger remain unchanged. No dollar reservations, paid fallback, tools, or hidden retries. Output is bounded to 2,000 tokens with reasoning disabled and a 75-second timeout. The response must report zero cost. The free account allows up to 50 requests/day shared by all users; each CropDoc user also has five attempts/day. Free capacity is not guaranteed. See [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits).
- Up to 100 retained inspections and ten active device tokens per user. Up to two simultaneous upload/analysis leases. Delete old reports or revoke tokens to free capacity.
- Analysis runs within a bounded HTTP request, without a worker. A 120-second processing lease makes interrupted work explicitly retryable. A lost response does not immediately trigger a duplicate AI call. The CLI persists idempotency state and checks the same inspection before requesting an explicit retry.
- Files and reports remain until deletion. Deletion removes Storage objects before tracking rows. Account deletion denies subsequent access, revokes tokens, and cleans data through verified webhook retries. Aggregate budget usage is preserved.

## Security and data flow

Browser/CLI → authenticated Next.js API → private Supabase Storage → Gemini image input → validated report → Supabase.

Normal web reads carry a verified Clerk session token through Supabase RLS. Policies match `auth.jwt()->>'sub'` to indexed text ownership IDs. Composite foreign keys prohibit attaching images/reports to another user's inspection. Client roles cannot write reports, quotas, token digests, or processing state. Server-only mutations check ownership and use restricted atomic functions; only the server has the service key.

Tokens have 256 random bits, are shown once, and only SHA-256 digests are stored. A device can upload and read/retry inspections it created; it cannot browse web uploads, other devices' reports, manage tokens, or delete records. Signed image URLs expire after five minutes and are bearer links during that interval. Avoid sharing them. OpenRouter and AtlasCloud receive optimized photos, crop name and symptom notes only. Account identifiers and location are excluded. Provider routing sets `data_collection: "deny"`; this excludes training use but does not promise zero retention.

Before submission and in device setup, users see: **“OpenRouter and AtlasCloud check your photos. Upload crop-only photos without people or personal details.”** Keep OpenRouter prompt logging and training opt-ins disabled. See [data handling](https://openrouter.ai/docs/guides/privacy/data-collection). Private Supabase storage does not hide submitted photos from the analysis providers.

## API

| Endpoint                                    | Authentication             | Purpose                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/inspections`                     | Clerk                      | Multipart upload: `images`, optional `crop`, `location`, `notes`; required `Idempotency-Key`                                                                                                                                                                                   |
| `GET /api/inspections?page=0`               | Clerk                      | Newest reports, 20 per page: `{inspections: [{id, status, crop_hint, created_at, image_count, error_message, report, thumbnail_url}]}`. `report` is the saved report or `null`; `thumbnail_url` is a five-minute signed URL of the first photo, or `null` if it is unavailable |
| `GET /api/usage`                            | Clerk                      | Checks used today (India calendar day): `{used, limit}`                                                                                                                                                                                                                        |
| `GET/DELETE /api/inspections/:id`           | Clerk                      | Own report or deletion                                                                                                                                                                                                                                                         |
| `POST /api/inspections/:id/analyze?retry=1` | Clerk                      | Analysis; explicit retry for failed/stale attempts                                                                                                                                                                                                                             |
| `GET/POST /api/devices`                     | Clerk                      | List token metadata or create a token with JSON `{name}`                                                                                                                                                                                                                       |
| `DELETE /api/devices/:id`                   | Clerk                      | Revoke a token                                                                                                                                                                                                                                                                 |
| `POST /api/device/upload`                   | Bearer device token        | Same multipart upload, followed by analysis                                                                                                                                                                                                                                    |
| `GET/POST /api/device/inspections/:id`      | Same device token          | Status/report or explicit analysis retry                                                                                                                                                                                                                                       |
| `POST /api/webhooks/clerk`                  | Verified webhook signature | Account-deletion cleanup                                                                                                                                                                                                                                                       |

Errors use `{error: {code, message}}`. Daily/provider/storage limits return 429; invalid/revoked tokens return 401; inaccessible reports return 404. Retry transport failures and transient 5xx with bounded backoff; stop on permanent errors or provider quota exhaustion. Never follow an API redirect with a device credential.

Device setup: [device-client/README.md](device-client/README.md).
