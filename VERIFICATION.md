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

Analysis remains disabled until the dedicated Google project has been verified without billing and its API key installed. `GEMINI_FREE_TIER_VERIFIED` is an operator assertion, not an ongoing billing monitor. Billing must remain detached.

The existing Clerk issuer must also be registered in Supabase hosted Authentication → Third-Party Auth: `https://daring-polliwog-7246.clerk.accounts.dev`. The earlier signed-in JWT test failed with `PGRST301 No suitable key was found to decode the JWT`; RLS has not been weakened to work around it.

A revocation request was submitted for the exposed OpenAI key. The account UI became inaccessible before its final status could be verified. No OpenAI key is needed by this release.

**No real Gemini report has yet been produced and reopened by its owner. Do not describe deployment as end-to-end complete until that succeeds.** Real single/grouped/uncertain-photo reports and successful Python report completion remain pending service setup.

## Earlier live checks

The previous deployed release passed password and email-code login with Clerk development test accounts, malformed-upload rejection, four-image private upload persistence, upload deduplication, signed image access and public image denial, cross-device read denial, immediate token revocation and real signed Clerk deletion-webhook cleanup. The real Python uploader preserved its idempotency state and saved photos when AI configuration was missing. These checks did not produce an AI report.

The newer farmer interface was inspected locally at mobile and desktop sizes in light and dark themes. Report variants used clearly identified browser-only sample data; they were not AI reports or saved diagnoses. The silent walkthrough video shows the new interface.

## Demo and hardware limitations

Clerk development credentials are used on the Vercel demo domain. Production authentication needs an owned domain and a production Clerk/OAuth configuration. Google login still needs a real end-to-end check.

No physical Raspberry Pi or USB camera was available. OpenCV was installed and a Mac camera capture was attempted earlier; macOS denied camera access, so no real camera capture was verified.
