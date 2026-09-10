import { deviceIdentity } from "@/lib/auth";
import { uploadInspection, analyzeInspection } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
import { env } from "@/lib/supabase";
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    const identity = await deviceIdentity(req);
    const inspection = await uploadInspection(identity, req);
    const view =
      inspection.status === "ready"
        ? await analyzeInspection(identity, inspection.id)
        : null;
    return Response.json(
      {
        inspection_id: inspection.id,
        status: view?.status ?? inspection.status,
        report: view?.report ?? null,
        report_url: `${env("NEXT_PUBLIC_APP_URL")}/reports/${inspection.id}`,
        status_url: `${env("NEXT_PUBLIC_APP_URL")}/api/device/inspections/${inspection.id}`,
      },
      { status: view?.status === "complete" ? 201 : 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
