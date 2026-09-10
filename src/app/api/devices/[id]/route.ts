import { z } from "zod";
import { webIdentity, sameOrigin } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";
import { databaseError, errorResponse, AppError } from "@/lib/errors";
export async function DELETE(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const i = await webIdentity();
    const id = z.uuid().parse((await c.params).id);
    const { data, error } = await adminDb()
      .from("device_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", i.owner)
      .select("id")
      .maybeSingle();
    databaseError(error);
    if (!data) throw new AppError("NOT_FOUND", "Token not found.", 404);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
