import { ZodError } from "zod";
import { DAILY_CHECKS } from "./limits";
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
// Growers read these, so they use everyday words and say what to do next.
const messages: Record<string, [number, string]> = {
  NOT_FOUND: [404, "This report was not found. It may have been deleted."],
  ACCOUNT_DELETED: [403, "This account has been deleted."],
  TOKEN_REVOKED: [401, "The device token is invalid or revoked."],
  IDEMPOTENCY_CONFLICT: [
    409,
    "This request key was already used for different photos.",
  ],
  STORAGE_QUOTA: [
    429,
    "You have too many saved reports. Delete an old report to add a new one.",
  ],
  BUSY: [
    429,
    "Other photos are still being sent. Wait a moment and try again.",
  ],
  NOT_READY: [409, "The photos are still being sent. Try again in a moment."],
  DAILY_QUOTA: [
    429,
    `You have used all ${DAILY_CHECKS} checks for today. You can check again tomorrow.`,
  ],
  BUDGET_EXHAUSTED: [
    429,
    "CropDoc cannot check more crops right now. Your saved reports are still here.",
  ],
  TOKEN_LIMIT: [429, "Remove a device key before making another one."],
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
    "CropDoc could not open your saved reports just now. Please try again in a moment.",
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
