import { webIdentity, sameOrigin } from "@/lib/auth";
import { analyzeInspection } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
export const maxDuration = 120;
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    return Response.json(
      await analyzeInspection(
        await webIdentity(),
        (await c.params).id,
        new URL(req.url).searchParams.get("retry") === "1",
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
