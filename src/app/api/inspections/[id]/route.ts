import { webIdentity, sameOrigin } from "@/lib/auth";
import { inspectionView, deleteInspection } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, c: Context) {
  try {
    return Response.json(
      await inspectionView(await webIdentity(), (await c.params).id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request, c: Context) {
  try {
    sameOrigin(req);
    await deleteInspection(await webIdentity(), (await c.params).id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
