import { webIdentity } from "@/lib/auth";
import { dailyUsage } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
export async function GET() {
  try {
    const identity = await webIdentity();
    return Response.json(await dailyUsage(identity), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
