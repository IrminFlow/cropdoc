export async function GET() {
  const configured =
    [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ].every((k) => Boolean(process.env[k])) &&
    (!process.env.OPENAI_MODEL || process.env.OPENAI_MODEL === "gpt-6-luna");
  return Response.json(
    { service: "cropdoc", configured },
    { status: configured ? 200 : 503 },
  );
}
