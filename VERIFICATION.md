# CropDoc verification

Demo: https://cropdoc-lilac.vercel.app
Private source: https://github.com/IrminFlow/cropdoc

## Current release: Gemini free tier (14 September 2026)

Implemented the Gemini 3.8 Flash Interactions API with inline optimized images, strict JSON output and server validation. Requests exclude account identifiers and location. There are no paid fallbacks, provider retries or tools. Google data-use disclosure appears before web submission, in device setup, and in the help documentation. Previous local farmer UI and Python uploader improvements are included.

- Passed ESLint, TypeScript, 65 application tests, 30 Python tests and a Node 22 production build.
- Applied `202609140001_gemini_free.sql` to the isolated hosted CropDoc Supabase project.
- Passed hosted RLS and private Storage isolation, protected grants, parent-child ownership, deleted-account denial, zero-cost accounting with an exhausted historical budget, concurrent five-attempt daily admission, duplicate claims and revoked-device rejection.
- Tests cover grouped Gemini input, malformed/overlong reports, refusals, incomplete responses, provider errors, AI_QUOTA persistence and no automatic retry/fallback. Missing credentials or unverified free-tier configuration prevents provider calls.
- Historical financial records are retained. New Gemini attempts record zero cost and do not modify `ai_budget`.

## Account setup and end-to-end status

The release is deployed from GitHub commit `044a705`; GitHub CI passed. Gemini credentials and the dedicated project ID are installed locally and in Vercel's encrypted Production settings.

Google project `durable-bond-508608-m9` (number `567284979080`) was checked in Google Cloud Billing: **“This project has no billing account.”** Model lookup for `gemini-3.8-flash` returned HTTP 200. A real crop-photo Interactions request returned HTTP 403: **“Your project has been denied access. Please contact support.”** AI Studio lists its billing tier as Unavailable. Analysis remains disabled (`GEMINI_FREE_TIER_VERIFIED=false`) because free inference access could not be verified. No paid fallback or upgrade was attempted.

The Clerk issuer `https://daring-polliwog-7246.clerk.accounts.dev` is now registered with hosted Supabase. Actual Clerk JWT access succeeds. Additional live checks passed:

- Real crop photos uploaded through the web API, grouped and reopened by their owner.
- Another real Clerk user denied access to the inspection and its private Storage image, both through the web API and directly through Supabase RLS.
- Duplicate web submission reused the inspection; disabled analysis consumed zero attempts; history stayed accessible.
- Owner deletion removed photos and records.
- The deployed Python CLI persisted optimized photos and reused its stable key after the expected AI_CONFIGURATION response.
- Live device tests again verified malformed-upload rejection, private grouped uploads, duplicate protection, cross-device denial, immediate revocation and signed Clerk deletion-webhook cleanup.

A revocation request was submitted for the exposed OpenAI key. The account UI became inaccessible before its final status could be verified. No OpenAI key is needed by this release.

**No real Gemini report has yet been produced and reopened by its owner. Do not describe deployment as end-to-end complete until that succeeds.** Real single/grouped/uncertain-photo reports and successful Python report completion are blocked by Google’s project-access denial. A different AI provider would require an explicit product/provider decision and updated disclosures.

## Earlier live checks

The previous deployed release passed password and email-code login with Clerk development test accounts, malformed-upload rejection, four-image private upload persistence, upload deduplication, signed image access and public image denial, cross-device read denial, immediate token revocation and real signed Clerk deletion-webhook cleanup. The real Python uploader preserved its idempotency state and saved photos when AI configuration was missing. These checks did not produce an AI report.

The newer farmer interface was inspected locally at mobile and desktop sizes in light and dark themes. Report variants used clearly identified browser-only sample data; they were not AI reports or saved diagnoses. The silent walkthrough video shows the new interface.

## Demo and hardware limitations

Clerk development credentials are used on the Vercel demo domain. Production authentication needs an owned domain and a production Clerk/OAuth configuration. Google login still needs a real end-to-end check.

No physical Raspberry Pi or USB camera was available. OpenCV was installed and a Mac camera capture was attempted earlier; macOS denied camera access, so no real camera capture was verified.
