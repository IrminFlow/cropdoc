import { webIdentity, sameOrigin } from "@/lib/auth";
import { listInspections, uploadInspection } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
import { REPORTS_PAGE_SIZE } from "@/lib/limits";
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
    const params = new URL(req.url).searchParams;
    const inspections = await listInspections(
      identity,
      Number(params.get("page")),
      Number(params.get("limit")) || REPORTS_PAGE_SIZE,
    );
    return Response.json(
      { inspections },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
