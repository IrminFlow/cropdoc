/* eslint-disable @next/next/no-img-element -- photos use short-lived signed URLs that must not be cached by the image optimizer */
import Image from "next/image";
import Link from "next/link";
import { Camera, CaretRight, Plant } from "@phosphor-icons/react/ssr";
import emptyPhoto from "@/assets/photos/empty.jpg";
import { dateLabel } from "@/lib/client";
import type { InspectionSummary } from "@/lib/types";
import { Skeleton } from "./ui";
import { SeverityChip, StatusChip } from "./verdict";
import styles from "./report-list.module.css";

/** Reports in one list, or grouped under "Today", "Yesterday" and older dates. */
export function ReportList({
  items,
  grouped = false,
}: {
  items: InspectionSummary[];
  grouped?: boolean;
}) {
  if (!grouped) return <Rows items={items} showDate />;
  const days = new Map<string, InspectionSummary[]>();
  for (const item of items) {
    const day = dateLabel(item.created_at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <div className={styles.days}>
      {[...days].map(([day, rows]) => (
        <section key={day} aria-label={day}>
          <h2 className={styles.day}>{day}</h2>
          <Rows items={rows} showDate={false} />
        </section>
      ))}
    </div>
  );
}

function Rows({
  items,
  showDate,
}: {
  items: InspectionSummary[];
  showDate: boolean;
}) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id}>
          <Link href={`/reports/${item.id}`} className={styles.row}>
            <span className={styles.thumb}>
              {item.thumbnail_url ? (
                <img src={item.thumbnail_url} alt="" loading="lazy" />
              ) : (
                <Plant size={32} weight="duotone" aria-hidden />
              )}
            </span>
            <span className={styles.body}>
              <strong className={styles.crop}>
                {item.report?.crop || item.crop_hint || "Crop photo"}
              </strong>
              {item.report && (
                <span className={styles.issue}>{item.report.likely_issue}</span>
              )}
              <span className={styles.meta}>
                {item.report ? (
                  <SeverityChip severity={item.report.severity} />
                ) : (
                  <StatusChip status={item.status} />
                )}
                {showDate && (
                  <span className={styles.date}>
                    {dateLabel(item.created_at)}
                  </span>
                )}
              </span>
            </span>
            <CaretRight
              className={styles.chevron}
              size={22}
              weight="bold"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ReportListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className={styles.row}>
            <Skeleton width={72} height={72} radius={16} />
            <span className={styles.body}>
              <Skeleton width="42%" height={20} radius={8} />
              <Skeleton width="78%" height={16} radius={8} />
              <Skeleton width={120} height={26} radius={999} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyReports() {
  return (
    <div className={`${styles.empty} rise`}>
      <Image
        src={emptyPhoto}
        alt=""
        className={styles.emptyPhoto}
        sizes="(min-width: 700px) 320px, 72vw"
        placeholder="blur"
      />
      <h2>No reports yet</h2>
      <p>Take a photo of a sick plant to get your first report.</p>
      <Link href="/upload" className="btn btn-big">
        <Camera size={26} weight="bold" aria-hidden /> Check a crop
      </Link>
    </div>
  );
}
