import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { adminDb, env } from "./supabase";
import type { Identity } from "./auth";
import { AppError, databaseError } from "./errors";
import { limitedForm, optimizeImage } from "./images";
import { reportSchema, REPORT_PROMPT, validateReport } from "./report";
import type { Inspection, InspectionView } from "./types";
const metadata = z.object({
  crop: z.string().trim().max(80),
  location: z.string().trim().max(120),
  notes: z.string().trim().max(500),
});
export async function getInspection(
  identity: Identity,
  id: string,
): Promise<Inspection> {
  z.uuid().parse(id);
  let q = identity.db
    .from("inspections")
    .select("*")
    .eq("id", id)
    .eq("owner_id", identity.owner);
  if (identity.device) q = q.eq("device_token_id", identity.device);
  const { data, error } = await q.maybeSingle();
  databaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Report not found.", 404);
  return data as Inspection;
}
export async function inspectionView(
  identity: Identity,
  id: string,
): Promise<InspectionView> {
  const item = await getInspection(identity, id);
  const [im, r] = await Promise.all([
    identity.db
      .from("inspection_images")
      .select("id,path,position")
      .eq("inspection_id", id)
      .eq("owner_id", identity.owner)
      .order("position"),
    identity.db
      .from("analysis_reports")
      .select("report")
      .eq("inspection_id", id)
      .eq("owner_id", identity.owner)
      .maybeSingle(),
  ]);
  databaseError(im.error);
  databaseError(r.error);
  const images = await Promise.all(
    (im.data ?? []).map(async (x) => {
      const { data, error } = await identity.db.storage
        .from("crop-images")
        .createSignedUrl(x.path, 300);
      databaseError(error);
      return { id: x.id, url: data!.signedUrl, position: x.position };
    }),
  );
  return {
    ...item,
    images,
    report: r.data ? validateReport(r.data.report) : null,
    lease_active: new Date(item.lease_until ?? 0).getTime() > Date.now(),
    retryable:
      item.status === "failed" ||
      (item.status === "analyzing" &&
        new Date(item.lease_until ?? 0).getTime() < Date.now()),
  };
}
export async function uploadInspection(identity: Identity, request: Request) {
  const key = z
    .string()
    .min(16)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .parse(request.headers.get("idempotency-key"));
  const form = await limitedForm(request);
  const hints = metadata.parse({
    crop: form.get("crop") ?? "",
    location: form.get("location") ?? "",
    notes: form.get("notes") ?? "",
  });
  const files = form.getAll("images");
  if (
    files.length < 1 ||
    files.length > 4 ||
    files.some((f) => !(f instanceof File))
  )
    throw new AppError("INVALID_IMAGE", "Choose one to four crop photos.");
  const buffers = await Promise.all(
    files.map(async (f) => Buffer.from(await (f as File).arrayBuffer())),
  );
  const fingerprint = createHash("sha256").update(JSON.stringify(hints));
  buffers.forEach((b) =>
    fingerprint.update(createHash("sha256").update(b).digest()),
  );
  const images = await Promise.all(buffers.map(optimizeImage));
  const db = adminDb();
  const { data, error } = await db.rpc("prepare_inspection", {
    p_owner: identity.owner,
    p_key: key,
    p_fingerprint: fingerprint.digest("hex"),
    p_device: identity.device,
    p_crop: hints.crop,
    p_location: hints.location,
    p_notes: hints.notes,
    p_count: images.length,
  });
  databaseError(error);
  const item = data.inspection as Inspection;
  if (!data.acquired) return item;
  // Deterministic paths make interrupted uploads recoverable without creating orphan objects.
  for (const [position, image] of images.entries()) {
    const path = `${identity.owner}/${item.id}/${position}.jpg`;
    const { error: rowError } = await db.from("inspection_images").upsert(
      {
        inspection_id: item.id,
        owner_id: identity.owner,
        path,
        position,
        width: image.width,
        height: image.height,
        bytes: image.data.length,
      },
      { onConflict: "inspection_id,position" },
    );
    databaseError(rowError);
    const { error: storageError } = await db.storage
      .from("crop-images")
      .upload(path, image.data, { contentType: "image/jpeg", upsert: true });
    databaseError(storageError);
  }
  const { data: ready, error: readyError } = await db
    .from("inspections")
    .update({
      status: "ready",
      lease_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("owner_id", identity.owner)
    .eq("lease_id", item.lease_id!)
    .eq("status", "uploading")
    .select("*")
    .single();
  databaseError(readyError);
  return ready as Inspection;
}
export async function analyzeInspection(
  identity: Identity,
  id: string,
  retry = false,
) {
  await getInspection(identity, id);
  // Fail before reserving money if the provider has not been configured.
  const apiKey = env("OPENAI_API_KEY");
  if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL !== "gpt-5.6-luna")
    throw new AppError(
      "MODEL_CONFIGURATION",
      "This demo is configured for GPT-5.6 Luna only.",
      503,
    );
  const db = adminDb();
  const { data: claim, error } = await db.rpc("claim_analysis", {
    p_owner: identity.owner,
    p_id: id,
    p_retry: retry,
  });
  databaseError(error);
  if (!claim.acquired) return inspectionView(identity, id);
  const attempt = claim.attempt_id as string;
  let cost: number | null = null;
  let report = null;
  let message: string | null = null;
  try {
    const item = await getInspection(identity, id);
    const { data: images, error: imError } = await db
      .from("inspection_images")
      .select("path")
      .eq("inspection_id", id)
      .eq("owner_id", identity.owner)
      .order("position");
    databaseError(imError);
    const urls = await Promise.all(
      (images ?? []).map(async (image) => {
        const { data, error } = await db.storage
          .from("crop-images")
          .download(image.path);
        databaseError(error);
        return `data:image/jpeg;base64,${Buffer.from(await data!.arrayBuffer()).toString("base64")}`;
      }),
    );
    const openai = new OpenAI({ apiKey, timeout: 75_000, maxRetries: 0 });
    const response = await openai.responses.parse({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1500,
      input: [
        { role: "system", content: REPORT_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                crop: item.crop_hint,
                location: item.location,
                notes: item.notes,
              }),
            },
            ...urls.map((image_url) => ({
              type: "input_image" as const,
              image_url,
              detail: "high" as const,
            })),
          ],
        },
      ],
      text: { format: zodTextFormat(reportSchema, "crop_report") },
    });
    // USD/million tokens: input .20, output 1.20; count cached input at full price conservatively.
    if (response.usage)
      cost = Math.ceil(
        response.usage.input_tokens * 0.2 + response.usage.output_tokens * 1.2,
      );
    if (response.status !== "completed" || !response.output_parsed)
      throw new Error("incomplete");
    report = validateReport(response.output_parsed);
  } catch (error) {
    message =
      error instanceof OpenAI.APIError && error.status === 429
        ? "The AI service is temporarily unavailable. Try again later."
        : "Analysis could not be completed. You can retry with these photos.";
    console.error(
      JSON.stringify({
        event: "analysis_failed",
        inspectionId: id,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  const { data: finished, error: finishError } = await db.rpc(
    "finish_analysis",
    {
      p_owner: identity.owner,
      p_id: id,
      p_attempt: attempt,
      p_report: report,
      p_cost: cost,
      p_error: message,
    },
  );
  databaseError(finishError);
  if (!finished)
    throw new AppError(
      "STALE_ANALYSIS",
      "This analysis was interrupted. Refresh the report.",
      409,
    );
  return inspectionView(identity, id);
}
export async function deleteInspection(identity: Identity, id: string) {
  const item = await getInspection(identity, id);
  if (
    ["uploading", "analyzing"].includes(item.status) &&
    new Date(item.lease_until ?? 0).getTime() > Date.now()
  )
    throw new AppError(
      "BUSY",
      "Wait for the current upload or analysis to finish before deleting.",
      409,
      10,
    );
  const db = adminDb();
  const { data: locked, error } = await db
    .from("inspections")
    .update({ status: "deleting", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", identity.owner)
    .eq("status", item.status)
    .eq("updated_at", item.updated_at)
    .select("id")
    .maybeSingle();
  databaseError(error);
  if (!locked)
    throw new AppError(
      "BUSY",
      "This report changed. Refresh and try again.",
      409,
      5,
    );
  const { data: images, error: ie } = await db
    .from("inspection_images")
    .select("path")
    .eq("inspection_id", id)
    .eq("owner_id", identity.owner);
  databaseError(ie);
  if (images?.length) {
    const { error: se } = await db.storage
      .from("crop-images")
      .remove(images.map((x) => x.path));
    databaseError(se);
  }
  const { error: de } = await db
    .from("inspections")
    .delete()
    .eq("id", id)
    .eq("owner_id", identity.owner)
    .eq("status", "deleting");
  databaseError(de);
}
export async function deleteAccountData(owner: string) {
  const db = adminDb();
  const { error } = await db.from("deleted_users").upsert({ owner_id: owner });
  databaseError(error);
  databaseError(
    (
      await db
        .from("device_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("owner_id", owner)
    ).error,
  );
  const { data: items, error: ie } = await db
    .from("inspections")
    .select("id")
    .eq("owner_id", owner);
  databaseError(ie);
  for (const item of items ?? [])
    await deleteInspection({ owner, device: null, db }, item.id);
  databaseError(
    (await db.from("device_tokens").delete().eq("owner_id", owner)).error,
  );
  databaseError(
    (await db.from("daily_usage").delete().eq("owner_id", owner)).error,
  );
  // Retain aggregate costs; remove the deleted user's identifier from audit entries.
  databaseError(
    (
      await db
        .from("analysis_attempts")
        .update({ owner_id: "deleted" })
        .eq("owner_id", owner)
    ).error,
  );
}
