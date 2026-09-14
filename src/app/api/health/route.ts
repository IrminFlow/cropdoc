export async function GET() {
  const configured =
    [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY",
      "GEMINI_PROJECT_ID",
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ].every((k) => Boolean(process.env[k])) &&
    process.env.GEMINI_FREE_TIER_VERIFIED === "true" &&
    (!process.env.GEMINI_MODEL ||
      process.env.GEMINI_MODEL === "gemini-3.8-flash");
  return Response.json(
    { service: "cropdoc", configured },
    { status: configured ? 200 : 503 },
  );
}
