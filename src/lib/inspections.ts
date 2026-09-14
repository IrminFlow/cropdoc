import "server-only";
import { createHash } from "node:crypto";
import { analyzePhotos, openrouterKey, AI_QUOTA_MESSAGE } from "./openrouter";
import { z } from "zod";
import { adminDb } from "./supabase";
import type { Identity } from "./auth";
import { AppError, databaseError } from "./errors";
import { limitedForm, optimizeImage } from "./images";
import { DAILY_CHECKS, MAX_PHOTOS, REPORTS_PAGE_SIZE } from "./limits";
import { reportSchema, validateReport } from "./report";
import type {
  DailyUsage,
  Inspection,
  InspectionSummary,
  InspectionView,
} from "./types";
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
      // Tracking rows can outlive an interrupted upload or partial deletion.
      // Keep the inspection accessible so its owner can finish cleanup.
      if (error && ["uploading", "deleting"].includes(item.status)) return null;
      databaseError(error);
      return { id: x.id, url: data!.signedUrl, position: x.position };
    }),
  );
  return {
    ...item,
    images: images.filter((image) => image !== null),
    report: r.data ? validateReport(r.data.report) : null,
    lease_active: new Date(item.lease_until ?? 0).getTime() > Date.now(),
    retryable:
      item.status === "failed" ||
      (item.status === "analyzing" &&
        new Date(item.lease_until ?? 0).getTime() < Date.now()),
  };
}
const SUMMARY_COLUMNS =
  "id,status,crop_hint,created_at,image_count,error_message,analysis_reports(report),inspection_images(path,position)";
type SummaryRow = Omit<InspectionSummary, "report" | "thumbnail_url"> & {
  // PostgREST embeds the single report as an object or a one-element array,
  // depending on how it detects the relationship.
  analysis_reports: { report: unknown } | { report: unknown }[] | null;
  inspection_images: { path: string; position: number }[] | null;
};
function storedReport(embedded: SummaryRow["analysis_reports"]) {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  // One unreadable stored report must not break the whole history page.
  const parsed = reportSchema.safeParse(row?.report);
  return parsed.success ? parsed.data : null;
}
function firstPhotoPath(images: SummaryRow["inspection_images"]) {
  let first: { path: string; position: number } | null = null;
  for (const image of images ?? [])
    if (!first || image.position < first.position) first = image;
  return first?.path ?? null;
}
async function signThumbnails(identity: Identity, paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  try {
    const { data, error } = await identity.db.storage
      .from("crop-images")
      .createSignedUrls(paths, 300);
    if (error) return urls;
    for (const item of data)
      if (!item.error && item.path && item.signedUrl)
        urls.set(item.path, item.signedUrl);
  } catch {
    // Thumbnails are optional; a storage failure must not hide the history.
  }
  return urls;
}
export async function listInspections(
  identity: Identity,
  page: number,
  limit = REPORTS_PAGE_SIZE,
): Promise<InspectionSummary[]> {
  const from =
    Math.max(0, Math.min(1000, Math.floor(page) || 0)) * REPORTS_PAGE_SIZE;
  // Short lists such as "Recent reports" sign fewer thumbnails.
  const size = Math.max(
    1,
    Math.min(REPORTS_PAGE_SIZE, Math.floor(limit) || REPORTS_PAGE_SIZE),
  );
  const { data, error } = await identity.db
    .from("inspections")
    .select(SUMMARY_COLUMNS)
    .eq("owner_id", identity.owner)
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  databaseError(error);
  const rows = (data ?? []) as SummaryRow[];
  const paths = rows.map((row) => firstPhotoPath(row.inspection_images));
  const urls = await signThumbnails(identity, [
    ...new Set(paths.filter((path) => path !== null)),
  ]);
  return rows.map((row, i) => {
    const path = paths[i];
    return {
      id: row.id,
      status: row.status,
      crop_hint: row.crop_hint,
      created_at: row.created_at,
      image_count: row.image_count,
      error_message: row.error_message,
      report: storedReport(row.analysis_reports),
      thumbnail_url: path ? (urls.get(path) ?? null) : null,
    };
  });
}
/** Calendar day in India, matching the day claim_analysis counts attempts against. */
export function indiaDay(date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export async function dailyUsage(identity: Identity): Promise<DailyUsage> {
  const { data, error } = await identity.db
    .from("daily_usage")
    .select("attempts")
    .eq("owner_id", identity.owner)
    .eq("day", indiaDay())
    .maybeSingle();
  databaseError(error);
  const used = Math.min(DAILY_CHECKS, Math.max(0, Number(data?.attempts) || 0));
  return { used, limit: DAILY_CHECKS };
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
    files.length > MAX_PHOTOS ||
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
  const apiKey = openrouterKey();
  const db = adminDb();
  const { data: claim, error } = await db.rpc("claim_free_analysis", {
    p_owner: identity.owner,
    p_id: id,
    p_retry: retry,
  });
  databaseError(error);
  if (!claim.acquired) return inspectionView(identity, id);
  const attempt = claim.attempt_id as string;
  let errorCode = "ANALYSIS_FAILED";
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
        return Buffer.from(await data!.arrayBuffer()).toString("base64");
      }),
    );
    report = await analyzePhotos(apiKey, urls, item.crop_hint, item.notes);
  } catch (error) {
    if (error instanceof AppError && error.code === "AI_QUOTA")
      errorCode = "AI_QUOTA";
    message =
      errorCode === "AI_QUOTA"
        ? AI_QUOTA_MESSAGE
        : "The check could not finish. Try again with the same photos.";
    console.error(
      JSON.stringify({
        event: "analysis_failed",
        inspectionId: id,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  const { data: finished, error: finishError } = await db.rpc(
    "finish_free_analysis",
    {
      p_owner: identity.owner,
      p_id: id,
      p_attempt: attempt,
      p_report: report,
      p_error_code: errorCode,
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
  if (errorCode === "AI_QUOTA")
    throw new AppError("AI_QUOTA", AI_QUOTA_MESSAGE, 429);
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
