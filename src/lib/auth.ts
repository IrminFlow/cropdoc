import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createHash, randomBytes } from "node:crypto";
import { adminDb, userDb } from "./supabase";
import { AppError, databaseError } from "./errors";
export type Identity = {
  owner: string;
  device: string | null;
  db: ReturnType<typeof adminDb>;
};
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function newDeviceToken() {
  const token = `cd_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 11) };
}
export async function webIdentity(): Promise<Identity> {
  const session = await auth();
  const token = await session.getToken();
  if (!session.userId || !token)
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.", 401);
  const { data, error } = await adminDb()
    .from("deleted_users")
    .select("owner_id")
    .eq("owner_id", session.userId)
    .maybeSingle();
  databaseError(error);
  if (data)
    throw new AppError(
      "ACCOUNT_DELETED",
      "This account has been deleted.",
      403,
    );
  return { owner: session.userId, device: null, db: userDb(token) };
}
export async function deviceIdentity(request: Request): Promise<Identity> {
  const raw = request.headers
    .get("authorization")
    ?.match(/^Bearer (cd_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!raw)
    throw new AppError(
      "TOKEN_REVOKED",
      "A valid device token is required.",
      401,
    );
  const db = adminDb();
  const { data, error } = await db
    .from("device_tokens")
    .select("id,owner_id")
    .eq("token_hash", hashToken(raw))
    .is("revoked_at", null)
    .maybeSingle();
  databaseError(error);
  if (!data)
    throw new AppError(
      "TOKEN_REVOKED",
      "The device token is invalid or revoked.",
      401,
    );
  const { data: deleted, error: de } = await db
    .from("deleted_users")
    .select("owner_id")
    .eq("owner_id", data.owner_id)
    .maybeSingle();
  databaseError(de);
  if (deleted)
    throw new AppError(
      "TOKEN_REVOKED",
      "The device token is invalid or revoked.",
      401,
    );
  return { owner: data.owner_id, device: data.id, db };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError(
      "FORBIDDEN",
      "Cross-origin requests are not allowed.",
      403,
    );
}
