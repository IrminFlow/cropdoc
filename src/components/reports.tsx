"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, CircleNotch } from "@phosphor-icons/react/ssr";
import { api } from "@/lib/client";
import { REPORTS_PAGE_SIZE } from "@/lib/limits";
import type { InspectionSummary } from "@/lib/types";
import { EmptyReports, ReportList, ReportListSkeleton } from "./report-list";
import { ErrorNotice, PageHeader } from "./ui";

export function Reports() {
  const [items, setItems] = useState<InspectionSummary[]>([]);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ inspections: InspectionSummary[] }>(
      `/api/inspections?page=${page}`,
    ).then(
      ({ inspections }) => {
        if (!active) return;
        // New reports shift the pages, so skip any row already shown.
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...inspections.filter((i) => !seen.has(i.id))];
        });
        setHasMore(inspections.length === REPORTS_PAGE_SIZE);
        setLoading(false);
      },
      (e: Error) => {
        if (!active) return;
        setError(e.message);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [page, attempt]);

  function retry() {
    setError("");
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function showOlder() {
    setLoading(true);
    setPage((n) => n + 1);
  }

  return (
    <>
      <PageHeader
        title="My reports"
        lead="Every crop you have checked, newest first."
        action={
          <Link href="/upload" className="btn">
            <Camera size={24} weight="bold" aria-hidden /> Check a crop
          </Link>
        }
      />
      <p className="sr-only" role="status">
        {loading && items.length === 0 ? "Loading your reports…" : ""}
      </p>
      {error && <ErrorNotice message={error} onRetry={retry} />}
      <div className="rise" style={{ "--i": 1 } as React.CSSProperties}>
        {items.length > 0 ? (
          <ReportList items={items} grouped />
        ) : loading ? (
          <ReportListSkeleton />
        ) : (
          !error && <EmptyReports />
        )}
      </div>
      {hasMore && !error && (
        <button
          type="button"
          className="btn btn-ghost btn-block btn-spaced"
          disabled={loading}
          aria-busy={loading}
          onClick={showOlder}
        >
          {loading && (
            <CircleNotch className="spin" size={22} weight="bold" aria-hidden />
          )}
          {loading ? "Loading…" : "Show older reports"}
        </button>
      )}
    </>
  );
}
