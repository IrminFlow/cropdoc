import { webIdentity, sameOrigin } from "@/lib/auth";
import { uploadInspection } from "@/lib/inspections";
import { errorResponse, databaseError } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const identity = await webIdentity();
    const inspection = await uploadInspection(identity, req);
    return Response.json({ inspection }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(req: Request) {
  try {
    const identity = await webIdentity();
    const page = Math.max(
      0,
      Math.min(
        1000,
        Math.floor(Number(new URL(req.url).searchParams.get("page")) || 0),
      ),
    );
    const { data, error } = await identity.db
      .from("inspections")
      .select(
        "id,status,crop_hint,created_at,image_count,error_message,analysis_reports(report)",
      )
      .eq("owner_id", identity.owner)
      .order("created_at", { ascending: false })
      .range(page * 20, page * 20 + 19);
    databaseError(error);
    return Response.json(
      { inspections: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
