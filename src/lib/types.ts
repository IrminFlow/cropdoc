import type { CropReport } from "./report";
export type Inspection = {
  id: string;
  owner_id: string;
  device_token_id: string | null;
  status:
    "uploading" | "ready" | "analyzing" | "complete" | "failed" | "deleting";
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
