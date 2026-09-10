import { z } from "zod";
import { webIdentity, sameOrigin, newDeviceToken } from "@/lib/auth";
import { adminDb } from "@/lib/supabase";
import { databaseError, errorResponse } from "@/lib/errors";
export async function GET() {
  try {
    const i = await webIdentity();
    const { data, error } = await i.db
      .from("device_tokens")
      .select("id,name,prefix,created_at,revoked_at")
      .eq("owner_id", i.owner)
      .order("created_at", { ascending: false });
    databaseError(error);
    return Response.json(
      { tokens: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const i = await webIdentity();
    const { name } = z
      .object({ name: z.string().trim().min(1).max(60) })
      .parse(await req.json());
    const token = newDeviceToken();
    const { data, error } = await adminDb().rpc("create_device_token", {
      p_owner: i.owner,
      p_name: name,
      p_hash: token.hash,
      p_prefix: token.prefix,
    });
    databaseError(error);
    return Response.json(
      { id: data, token: token.token },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
