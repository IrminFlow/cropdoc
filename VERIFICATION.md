# Deployment verification

Demo: https://cropdoc-lilac.vercel.app

Private source: https://github.com/IrminFlow/cropdoc

## Passed

- ESLint, TypeScript, 14 application tests, and a production Next.js build.
- Six Python CLI tests: optimization/metadata, private configuration, URL validation, quota handling, stable retries, and completed-upload deduplication.
- Hosted database isolation tests: user RLS, private Storage policies, protected field/function grants, parent-child ownership, deletion denial, budget reservation, concurrent daily limits, duplicate claims, and revoked tokens.
- Actual Vercel deployment using Node 22.
- Clerk password login, device-trust email verification, and email-code login with Clerk development test credentials.
- Live API: missing credentials and malformed images rejected; four-image grouped upload persisted privately; duplicate request reused its inspection; signed image access succeeded; public image access failed; another device could not read the submission; revocation immediately denied access.
- Live Clerk webhook: unsigned deletion rejected; a real signed user-deletion event removed the fixture's Storage objects and database rows.
- Provider failure, incomplete/malformed report validation, conservative budget reservation, and duplicate processing behavior covered by application tests. These tests do not claim a real AI diagnosis.

## Provisioning still required

1. **Supabase hosted third-party issuer:** Clerk's Supabase integration is enabled, but Supabase still needs the provider registered in Authentication → Third-Party Auth. Issuer: `https://daring-polliwog-7246.clerk.accounts.dev`. The CLI's auth config push does not register this managed provider. Real Clerk JWT queries currently fail with `No suitable key or wrong key type`.
2. **OpenAI project key:** set `OPENAI_API_KEY` locally and in Vercel Production, with Responses API and `gpt-5.6-luna` access. No model fallback is configured. No paid inference has run.
3. Redeploy after setting the key. Verify a real saved crop report, web history, Google login, and successful Python uploads against the stable URL.

Chrome Beta computer automation became stuck on an inaccessible menu, and no Chrome browser extension connection was available. The two account-dashboard settings above could not be completed with the available authenticated tools. No unrelated projects were modified and no upgrades were purchased.

Clerk uses development credentials on the Vercel demo domain. Production auth on an owned domain remains a later setup step. End-to-end AI functionality is not yet verified; the deployment must not be described as a completed production service.
