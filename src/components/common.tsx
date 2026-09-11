import Link from "next/link";
import { ArrowRight, LoaderCircle, Sprout } from "lucide-react";
import { dateLabel } from "@/lib/client";
import type { CropReport } from "@/lib/report";
export type ListItem = {
  id: string;
  status: string;
  crop_hint: string;
  created_at: string;
  image_count: number;
  analysis_reports: { report: CropReport } | null;
};
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> Loading…
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      {message}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      {value === "complete"
        ? "Complete"
        : value === "ready"
          ? "Ready to check"
          : value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}
export function Empty() {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Sprout size={30} />
      </div>
      <h3>No reports yet</h3>
      <p>Add your first crop photo to get started.</p>
      <Link href="/upload" className="button secondary">
        Check crop <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function ReportList({ items }: { items: ListItem[] }) {
  return items.length ? (
    <div className="report-list">
      {items.map((item) => {
        const r = item.analysis_reports?.report;
        return (
          <Link
            href={`/reports/${item.id}`}
            key={item.id}
            className="report-row"
          >
            <div className="report-leaf">
              <Sprout size={23} />
            </div>
            <div className="report-row-title">
              <strong>{r?.crop || item.crop_hint || "Crop photo"}</strong>
              <span>{r?.likely_issue || "View report"}</span>
            </div>
            <span className="row-date">{dateLabel(item.created_at)}</span>
            <Badge value={r?.severity ?? item.status} />
            <ArrowRight size={17} />
          </Link>
        );
      })}
    </div>
  ) : (
    <Empty />
  );
}
