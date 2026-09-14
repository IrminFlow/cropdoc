export async function GET() {
  const configured =
    [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENROUTER_API_KEY",
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ].every((k) => Boolean(process.env[k])) &&
    process.env.OPENROUTER_FREE_TIER_VERIFIED === "true" &&
    (!process.env.OPENROUTER_MODEL ||
      process.env.OPENROUTER_MODEL === "dots-studio/dots-3-note-preview:free");
  return Response.json(
    { service: "cropdoc", configured },
    { status: configured ? 200 : 503 },
  );
}
