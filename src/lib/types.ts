import type { CropReport } from "./report";
export type InspectionStatus =
  "uploading" | "ready" | "analyzing" | "complete" | "failed" | "deleting";
export type Inspection = {
  id: string;
  owner_id: string;
  device_token_id: string | null;
  status: InspectionStatus;
  crop_hint: string;
  location: string;
  notes: string;
  image_count: number;
  created_at: string;
  updated_at: string;
  error_code: string | null;
  error_message: string | null;
  lease_id: string | null;
  lease_until: string | null;
};
export type InspectionView = Inspection & {
  images: { id: string; url: string; position: number }[];
  report: CropReport | null;
  retryable: boolean;
  lease_active: boolean;
};
/** One row of the report history. */
export type InspectionSummary = Pick<
  Inspection,
  "id" | "status" | "crop_hint" | "created_at" | "image_count" | "error_message"
> & {
  report: CropReport | null;
  /** Short-lived signed URL of the first photo, if it is still stored. */
  thumbnail_url: string | null;
};
/** Paid checks used on the current India calendar day. */
export type DailyUsage = { used: number; limit: number };
