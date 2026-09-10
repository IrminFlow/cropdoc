import { deviceIdentity } from "@/lib/auth";
import { inspectionView, analyzeInspection } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, c: Context) {
  try {
    return Response.json(
      await inspectionView(await deviceIdentity(req), (await c.params).id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, c: Context) {
  try {
    return Response.json(
      await analyzeInspection(
        await deviceIdentity(req),
        (await c.params).id,
        true,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
