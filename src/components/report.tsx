"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
import { api, dateLabel } from "@/lib/client";
import type { InspectionView } from "@/lib/types";
import { reportLabels, type CropReport } from "@/lib/report";
import { Badge, Loading, ErrorNotice } from "./common";
export function Report({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [item, setItem] = useState<InspectionView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const load = useCallback(async () => {
    try {
      setItem(await api<InspectionView>(`/api/inspections/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  const analyze = useCallback(
    async (retry: boolean) => {
      setBusy(true);
      setError("");
      try {
        setItem(
          await api<InspectionView>(
            `/api/inspections/${id}/analyze${retry ? "?retry=1" : ""}`,
            { method: "POST" },
          ),
        );
      } catch (e) {
        setError((e as Error).message);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [id, load],
  );
  // Synchronizes the initial URL-triggered analysis with the external API.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    if (
      item?.status === "ready" &&
      params.get("analyze") === "1" &&
      !started.current
    ) {
      started.current = true;
      void analyze(false);
    }
  }, [item, params, analyze]);
  useEffect(() => {
    if (
      !item ||
      !["analyzing", "uploading"].includes(item.status) ||
      item.retryable
    )
      return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [item, load]);
  async function remove() {
    if (
      !confirm("Delete this report and all its photos? This cannot be undone.")
    )
      return;
    setBusy(true);
    try {
      await api(`/api/inspections/${id}`, { method: "DELETE" });
      router.push("/reports");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (!item) return error ? <ErrorNotice message={error} /> : <Loading />;
  const report = item.report;
  const leaseActive = item.lease_active;
  return (
    <>
      <Link href="/reports" className="back-link">
        <ArrowLeft size={16} /> My reports
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your crop assessment</span>
          <h1>{report?.crop || item.crop_hint || "Crop inspection"}</h1>
          <p>
            {dateLabel(item.created_at)}
            {item.location ? ` · ${item.location}` : ""} · {item.image_count}{" "}
            {item.image_count === 1 ? "photo" : "photos"}
          </p>
        </div>
        <button
          className="button ghost danger"
          disabled={
            busy ||
            (["uploading", "analyzing"].includes(item.status) && leaseActive)
          }
          onClick={() => void remove()}
        >
          <Trash2 size={16} /> Delete report
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="report-layout">
        <div>
          <div className="report-photos">
            {item.images.map((im, i) => (
              <img
                src={im.url}
                alt={`Crop inspection, view ${i + 1}`}
                key={im.id}
              />
            ))}
          </div>
          <p className="fine photo-caption">
            Your photos · Private and saved securely
          </p>
        </div>
        <section className="panel report-panel">
          {report ? (
            <>
              <div className="report-panel-heading">
                <span>
                  <CheckCircle2 size={17} /> Assessment saved
                </span>
                <Badge value={report.severity} />
              </div>
              <dl className="report-fields">
                {(Object.keys(reportLabels) as (keyof CropReport)[])
                  .filter((key) => report[key] !== null)
                  .map((key) => (
                    <div
                      key={key}
                      className={key === "treatment" ? "treatment-row" : ""}
                    >
                      <dt>{reportLabels[key]}</dt>
                      <dd>
                        {key === "confidence" || key === "severity" ? (
                          <Badge value={report[key]!} />
                        ) : (
                          report[key]
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : (
            <div className="analysis-state">
              {busy || (item.status === "analyzing" && !item.retryable) ? (
                <>
                  <LoaderCircle className="spin" size={32} />
                  <h2>Taking a closer look.</h2>
                  <p>
                    We’re checking the visible signs and preparing your short
                    report.
                  </p>
                </>
              ) : item.status === "uploading" ? (
                <>
                  {leaseActive && <LoaderCircle className="spin" size={28} />}
                  <h2>
                    {leaseActive
                      ? "Waiting for your photos"
                      : "Upload interrupted"}
                  </h2>
                  <p>
                    If the upload was interrupted, return to the uploader and
                    retry with the same photos, or delete this inspection and
                    start again.
                  </p>
                </>
              ) : item.status === "deleting" ? (
                <>
                  <Trash2 size={28} />
                  <h2>Deletion needs another try</h2>
                  <p>
                    Use Delete report to finish removing this inspection and its
                    photos.
                  </p>
                </>
              ) : (
                <>
                  <RefreshCw size={30} />
                  <h2>
                    {item.status === "ready"
                      ? "Your photos are ready."
                      : "Let’s try another look."}
                  </h2>
                  <p>
                    {item.error_message ||
                      "Start an analysis to get a short crop-health report."}
                  </p>
                  <button
                    className="button"
                    onClick={() => void analyze(item.status !== "ready")}
                    disabled={busy}
                  >
                    {item.status === "ready"
                      ? "Analyze crop"
                      : "Retry analysis"}
                  </button>
                  <span className="fine">Uses one daily analysis attempt.</span>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
