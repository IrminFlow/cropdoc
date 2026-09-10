import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const messages: Record<string, [number, string]> = {
  NOT_FOUND: [404, "Report not found."],
  ACCOUNT_DELETED: [403, "This account has been deleted."],
  TOKEN_REVOKED: [401, "The device token is invalid or revoked."],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This request key was already used for different photos.",
  ],
  STORAGE_QUOTA: [429, "Delete an older report before uploading more."],
  BUSY: [429, "Two uploads are already in progress. Wait a moment and retry."],
  NOT_READY: [409, "The photos are still uploading. Try again shortly."],
  DAILY_QUOTA: [
    429,
    "You have used today’s five analysis attempts. Try again tomorrow (India time).",
  ],
  BUDGET_EXHAUSTED: [
    429,
    "The demo AI budget has been reached. Your saved reports are still available.",
  ],
  TOKEN_LIMIT: [429, "Revoke an existing token before creating another."],
};
export function databaseError(error: { message: string } | null) {
  if (!error) return;
  for (const [code, [status, message]] of Object.entries(messages))
    if (error.message.includes(code))
      throw new AppError(
        code,
        message,
        status,
        code === "BUSY" ? 10 : undefined,
      );
  throw new AppError(
    "DATABASE_ERROR",
    "The data service could not complete this request. Please retry.",
    503,
  );
}
export function errorResponse(error: unknown) {
  const e =
    error instanceof AppError
      ? error
      : error instanceof ZodError
        ? new AppError(
            "INVALID_INPUT",
            "Check the supplied fields and try again.",
          )
        : new AppError(
            "INTERNAL_ERROR",
            "Something went wrong. Please try again.",
            500,
          );
  if (e.status >= 500)
    console.error(JSON.stringify({ event: "request_failed", code: e.code }));
  return Response.json(
    { error: { code: e.code, message: e.message } },
    {
      status: e.status,
      headers: {
        "Cache-Control": "no-store",
        ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}),
      },
    },
  );
}
