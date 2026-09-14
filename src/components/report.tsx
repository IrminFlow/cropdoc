"use client";
/* eslint-disable @next/next/no-img-element -- photos use short-lived signed URLs that must not be cached by the image optimizer */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowClockwise,
  ArrowLeft,
  CalendarBlank,
  Camera,
  CircleNotch,
  CloudSlash,
  Eye,
  Images,
  Leaf,
  ListChecks,
  MapPin,
  Phone,
  Scan,
  ShieldCheck,
  Trash,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { api, dateLabel } from "@/lib/client";
import { DAILY_CHECKS } from "@/lib/limits";
import type { CropReport } from "@/lib/report";
import type { InspectionView } from "@/lib/types";
import {
  FIELD_LABELS,
  KISAN_HELPLINE,
  REPORT_CAVEAT,
  SEVERITY,
  issueLabel,
  reportSpeech,
} from "@/lib/verdict";
import { ListenButton } from "./listen";
import { ErrorNotice, Skeleton } from "./ui";
import { ConfidenceDots, SeverityIcon, SeverityMeter } from "./verdict";
import styles from "./report.module.css";

type Busy = "checking" | "deleting" | null;
const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function Report({ id }: { id: string }) {
  const router = useRouter();
  const autoCheck = useSearchParams().get("analyze") === "1";
  const [item, setItem] = useState<InspectionView | null>(null);
  // Errors from pressing a button stay until the next action; a failed
  // background refresh clears itself when a later refresh works.
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [justChecked, setJustChecked] = useState(false);
  const autoStarted = useRef(false);

  const load = useCallback(async () => {
    try {
      setItem(await api<InspectionView>(`/api/inspections/${id}`));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  const check = useCallback(
    async (retry: boolean) => {
      setBusy("checking");
      setError("");
      try {
        const view = await api<InspectionView>(
          `/api/inspections/${id}/analyze${retry ? "?retry=1" : ""}`,
          { method: "POST" },
        );
        setItem(view);
        setJustChecked(view.report !== null);
      } catch (e) {
        setError((e as Error).message);
        await load();
      } finally {
        setBusy(null);
      }
    },
    [id, load],
  );

  useEffect(() => {
    let active = true;
    api<InspectionView>(`/api/inspections/${id}`).then(
      (view) => active && setItem(view),
      (e: Error) => active && setLoadError(e.message),
    );
    return () => {
      active = false;
    };
  }, [id]);

  // Arriving from Check crop starts the check straight away.
  useEffect(() => {
    if (autoCheck && item?.status === "ready" && !autoStarted.current) {
      autoStarted.current = true;
      void check(false);
    }
  }, [autoCheck, item, check]);

  // Keep watching while someone else (another tab or a field camera) works on
  // it. A stopped upload can still be finished by a camera retrying it.
  useEffect(() => {
    if (!item || busy) return;
    const checkRunning = item.status === "analyzing" && !item.retryable;
    if (!checkRunning && item.status !== "uploading") return;
    const stalled = item.status === "uploading" && !item.lease_active;
    const timer = setInterval(() => void load(), stalled ? 15_000 : 4_000);
    return () => clearInterval(timer);
  }, [item, busy, load]);

  async function remove() {
    if (!confirm("Delete this report and its photos? You cannot undo this."))
      return;
    setBusy("deleting");
    setError("");
    try {
      await api(`/api/inspections/${id}`, { method: "DELETE" });
      router.push("/reports");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const message = error || loadError;
  if (!item)
    return message ? (
      <>
        <BackLink />
        <ErrorNotice message={message} onRetry={() => void load()} />
      </>
    ) : (
      <ReportSkeleton />
    );

  const checking =
    busy === "checking" || (item.status === "analyzing" && !item.retryable);
  const locked =
    ["uploading", "analyzing"].includes(item.status) && item.lease_active;
  const hasPhoto = item.images.length > 0;
  return (
    <>
      <BackLink />
      <div className={styles.layout}>
        <Photos images={item.images} scanning={checking} />
        <div className={`${styles.content} ${hasPhoto ? styles.overlap : ""}`}>
          {message && <ErrorNotice message={message} />}
          {item.report ? (
            <ReportBody report={item.report} announce={justChecked} />
          ) : (
            <Pending
              item={item}
              checking={checking}
              busy={busy}
              onCheck={(retry) => void check(retry)}
            />
          )}
          <footer className={`${styles.footer} rise`} style={order(5)}>
            <ul className={styles.meta}>
              <li>
                <CalendarBlank size={20} weight="bold" aria-hidden />
                {dateLabel(item.created_at)}
              </li>
              {item.location && (
                <li>
                  <MapPin size={20} weight="bold" aria-hidden />
                  {item.location}
                </li>
              )}
              <li>
                <Images size={20} weight="bold" aria-hidden />
                {item.image_count} {item.image_count === 1 ? "photo" : "photos"}
              </li>
            </ul>
            {item.report && (
              <Link href="/upload" className="btn btn-big btn-block">
                <Camera size={28} weight="bold" aria-hidden /> Check another
                crop
              </Link>
            )}
            <button
              type="button"
              className={`btn btn-danger btn-small ${styles.delete}`}
              disabled={Boolean(busy) || locked}
              aria-busy={busy === "deleting"}
              onClick={() => void remove()}
            >
              {busy === "deleting" ? (
                <CircleNotch
                  className="spin"
                  size={20}
                  weight="bold"
                  aria-hidden
                />
              ) : (
                <Trash size={20} weight="bold" aria-hidden />
              )}
              {busy === "deleting" ? "Deleting…" : "Delete report"}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/reports" className={styles.back}>
      <ArrowLeft size={22} weight="bold" aria-hidden /> My reports
    </Link>
  );
}

function ReportSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Opening report…
      </p>
      <BackLink />
      <div className={styles.layout} aria-hidden="true">
        <div className={`${styles.mainPhoto} skeleton`} />
        <div className={`${styles.content} ${styles.overlap}`}>
          <div className={styles.skeletonCard}>
            <Skeleton width="36%" height={18} radius={8} />
            <Skeleton width="70%" height={38} radius={10} />
            <Skeleton height={12} radius={999} />
            <Skeleton width="86%" height={22} radius={8} />
          </div>
          <Skeleton height={132} radius={24} />
        </div>
      </div>
    </>
  );
}

function Photos({
  images,
  scanning,
}: {
  images: InspectionView["images"];
  scanning: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const shown = images[selected] ?? images[0];
  // Photos can be missing after an interrupted upload or deletion.
  if (!shown) return null;
  return (
    <div className={`${styles.photos} rise`}>
      <figure className={styles.mainPhoto}>
        <img
          src={shown.url}
          alt={
            images.length > 1
              ? `Your crop photo, ${selected + 1} of ${images.length}`
              : "Your crop photo"
          }
        />
        {scanning && (
          <span className={`${styles.scanFrame} viewfinder`} aria-hidden>
            <span className={styles.scanLine} />
          </span>
        )}
        {images.length > 1 && (
          <ul className={styles.thumbs}>
            {images.map((image, i) => (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === selected}
                  onClick={() => setSelected(i)}
                >
                  <img src={image.url} alt="" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </figure>
    </div>
  );
}

function ReportBody({
  report,
  announce,
}: {
  report: CropReport;
  announce: boolean;
}) {
  const severity = SEVERITY[report.severity];
  const title = useRef<HTMLHeadingElement>(null);
  // The "Checking…" message disappears when the report arrives; moving focus
  // to the result tells screen-reader users that it is ready.
  useEffect(() => {
    if (announce) title.current?.focus();
  }, [announce]);
  return (
    <>
      <section
        className={`${styles.verdict} rise`}
        style={order(1)}
        data-tone={severity.tone}
      >
        <div className={styles.verdictHead}>
          <span className={styles.badge}>
            <SeverityIcon severity={report.severity} size={32} />
          </span>
          <h1 className={styles.title} ref={title} tabIndex={-1}>
            <span className={styles.crop}>{report.crop}</span>
            <span className={styles.severity}>{severity.label}</span>
          </h1>
        </div>
        <SeverityMeter severity={report.severity} animate />
        <div>
          <h2 className={styles.label}>{issueLabel(report.severity)}</h2>
          <p className={styles.issue}>{report.likely_issue}</p>
        </div>
        <div className={styles.verdictFoot}>
          <ConfidenceDots confidence={report.confidence} />
          <ListenButton text={reportSpeech(report)} label="Listen to report" />
        </div>
      </section>
      <section
        className={`${styles.todo} rise`}
        style={order(2)}
        aria-labelledby="todo-title"
      >
        <h2 id="todo-title">
          <span className={styles.todoIcon}>
            <ListChecks size={24} weight="bold" aria-hidden />
          </span>
          {FIELD_LABELS.treatment}
        </h2>
        <p>{report.treatment}</p>
      </section>
      <dl className={`${styles.facts} rise`} style={order(3)}>
        <Fact icon={Eye} label={FIELD_LABELS.symptoms} text={report.symptoms} />
        {report.home_remedy && (
          <Fact
            icon={Leaf}
            label={FIELD_LABELS.home_remedy}
            text={report.home_remedy}
          />
        )}
        <Fact
          icon={ShieldCheck}
          label={FIELD_LABELS.prevention}
          text={report.prevention}
        />
      </dl>
      <section
        className={`${styles.help} rise`}
        style={order(4)}
        aria-labelledby="help-title"
      >
        <h2 id="help-title">
          <span className={styles.helpIcon}>
            <Phone size={24} weight="duotone" aria-hidden />
          </span>
          Talk to a farm expert
        </h2>
        {report.expert_help && <p>{report.expert_help}</p>}
        <p className={styles.muted}>
          The Kisan helpline is free. Experts answer in many Indian languages.
        </p>
        <a className="btn btn-dark btn-block" href={KISAN_HELPLINE.href}>
          <Phone size={24} weight="fill" aria-hidden /> Call{" "}
          {KISAN_HELPLINE.display}
        </a>
        <p className={styles.caveat}>{REPORT_CAVEAT}</p>
      </section>
    </>
  );
}

function Fact({
  icon: FactIcon,
  label,
  text,
}: {
  icon: Icon;
  label: string;
  text: string;
}) {
  return (
    <div className={styles.fact}>
      <dt>
        <span className={styles.factIcon}>
          <FactIcon size={22} weight="duotone" aria-hidden />
        </span>
        {label}
      </dt>
      <dd>{text}</dd>
    </div>
  );
}

function Pending({
  item,
  checking,
  busy,
  onCheck,
}: {
  item: InspectionView;
  checking: boolean;
  busy: Busy;
  onCheck: (retry: boolean) => void;
}) {
  if (checking)
    return (
      <State
        icon={
          <CircleNotch className="spin" size={40} weight="bold" aria-hidden />
        }
        title="Checking your crop…"
        text="This takes about half a minute. Please keep this page open."
      />
    );
  if (item.status === "uploading")
    return item.lease_active ? (
      <State
        icon={
          <CircleNotch className="spin" size={40} weight="bold" aria-hidden />
        }
        title="Sending your photos…"
        text="This page will change by itself when they arrive."
      />
    ) : (
      <State
        icon={<CloudSlash size={40} weight="duotone" aria-hidden />}
        title="The photos did not finish sending"
        text="Send the same photos again from Check crop, or delete this report."
      >
        <Link href="/upload" className="btn btn-big btn-block">
          <Camera size={28} weight="bold" aria-hidden /> Go to Check crop
        </Link>
      </State>
    );
  if (item.status === "deleting")
    return (
      <State
        icon={<Trash size={40} weight="duotone" aria-hidden />}
        title="This report is not fully deleted"
        text="Press Delete report below to finish."
      />
    );
  const ready = item.status === "ready";
  return (
    <State
      icon={
        ready ? (
          <Scan size={40} weight="duotone" aria-hidden />
        ) : (
          <ArrowClockwise size={40} weight="bold" aria-hidden />
        )
      }
      title={ready ? "Your photos are ready" : "The check did not finish"}
      text={
        item.error_message ??
        (ready ? "Press the button to get your report." : "Please try again.")
      }
    >
      <button
        type="button"
        className="btn btn-big btn-block"
        disabled={Boolean(busy)}
        onClick={() => onCheck(!ready)}
      >
        {ready ? (
          <Scan size={28} weight="bold" aria-hidden />
        ) : (
          <ArrowClockwise size={26} weight="bold" aria-hidden />
        )}
        {ready ? "Check my crop" : "Try again"}
      </button>
      <p className={styles.note}>
        Uses 1 of your {DAILY_CHECKS} checks for today.
      </p>
    </State>
  );
}

function State({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`${styles.state} rise`} aria-live="polite">
      <span className={styles.stateIcon}>{icon}</span>
      <h1>{title}</h1>
      <p>{text}</p>
      {children}
    </section>
  );
}
