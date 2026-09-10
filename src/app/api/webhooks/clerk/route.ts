import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteAccountData } from "@/lib/inspections";
import { errorResponse } from "@/lib/errors";
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return Response.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }
  try {
    if (event.type === "user.deleted" && event.data.id)
      await deleteAccountData(event.data.id);
    return Response.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
