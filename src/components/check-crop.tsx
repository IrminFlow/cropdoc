"use client";
/* eslint-disable @next/next/no-img-element -- previews are local blob: URLs */
import { useEffect, useRef, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Camera,
  CaretDown,
  Check,
  CircleNotch,
  Crosshair,
  ImageSquare,
  Images,
  Plant,
  Scan,
  Sun,
  X,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import heroPhoto from "@/assets/photos/hero.jpg";
import tipClose from "@/assets/photos/tip-close.jpg";
import tipDaylight from "@/assets/photos/tip-daylight.jpg";
import tipOnePlant from "@/assets/photos/tip-one-plant.jpg";
import { api, compressPhoto, randomKey } from "@/lib/client";
import { DAILY_CHECKS, MAX_PHOTOS } from "@/lib/limits";
import type { DailyUsage, InspectionSummary } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { ReportList } from "./report-list";
import { ErrorNotice, PageHeader } from "./ui";
import styles from "./check-crop.module.css";

type Photo = { file: File; url: string; key: string };
type Mode = "same" | "separate";
type Details = { crop: string; location: string; notes: string };
const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function CheckCrop() {
  const router = useRouter();
  const { user } = useUser();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mode, setMode] = useState<Mode>("same");
  const [details, setDetails] = useState<Details>({
    crop: "",
    location: "",
    notes: "",
  });
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const { data: usage, reload: reloadUsage } = useApi<DailyUsage>("/api/usage");
  // One key per set of photos and details, so a retried upload is saved once.
  const uploadKey = useRef<string | null>(null);
  const photosRef = useRef(photos);
  const mounted = useRef(true);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  const busy = preparing || Boolean(progress);
  const reportCount = mode === "separate" ? photos.length : 1;
  const checksLeft = usage ? Math.max(0, usage.limit - usage.used) : null;

  function changed() {
    uploadKey.current = null;
  }

  async function addPhotos(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    let problem =
      files.length > room
        ? `Only ${MAX_PHOTOS} photos can be checked together. The extra photos were left out.`
        : "";
    setError("");
    setPreparing(true);
    const added: Photo[] = [];
    for (const file of files.slice(0, room)) {
      try {
        const small = await compressPhoto(file);
        added.push({
          file: small,
          url: URL.createObjectURL(small),
          key: randomKey(),
        });
      } catch (e) {
        problem = (e as Error).message;
      }
    }
    // The grower may have left the page while photos were being prepared.
    if (!mounted.current) {
      added.forEach((p) => URL.revokeObjectURL(p.url));
      return;
    }
    if (added.length) {
      setPhotos((current) => [...current, ...added]);
      changed();
    }
    setError(problem);
    setPreparing(false);
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url);
    setPhotos((current) => current.filter((p) => p.key !== photo.key));
    setError("");
    changed();
  }

  async function submit() {
    const groups = mode === "separate" ? photos.map((p) => [p]) : [photos];
    const key = (uploadKey.current ??= randomKey());
    let saved = 0;
    let leaving = false;
    setError("");
    try {
      for (const [index, group] of groups.entries()) {
        setProgress(
          groups.length > 1
            ? `Sending photo ${index + 1} of ${groups.length}…`
            : "Sending your photos…",
        );
        const form = new FormData();
        group.forEach((p) => form.append("images", p.file));
        form.set("crop", details.crop);
        form.set("location", details.location);
        form.set("notes", details.notes);
        const { inspection } = await api<{ inspection: { id: string } }>(
          "/api/inspections",
          {
            method: "POST",
            headers: { "Idempotency-Key": `${key}_${index}` },
            body: form,
          },
        );
        saved++;
        if (groups.length === 1) {
          leaving = true;
          router.push(`/reports/${inspection.id}?analyze=1`);
          return;
        }
        setProgress(`Checking photo ${index + 1} of ${groups.length}…`);
        await api(`/api/inspections/${inspection.id}/analyze`, {
          method: "POST",
        });
      }
      leaving = true;
      router.push("/reports");
    } catch (e) {
      const kept = saved ? " The photos already sent are in My reports." : "";
      setError(`${(e as Error).message}${kept}`);
      // Some checks may have been used before the failure.
      reloadUsage();
    } finally {
      if (!leaving) setProgress("");
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    void addPhotos(e.currentTarget.files);
    // Clear the input so choosing the same photo again still works.
    e.currentTarget.value = "";
  }

  const starting = photos.length === 0;
  return (
    <>
      {starting ? (
        <header className={`${styles.intro} rise`}>
          <p className={styles.greeting}>
            Namaste{user?.firstName ? `, ${user.firstName}` : ""}
          </p>
          <h1>Is your crop sick?</h1>
        </header>
      ) : (
        <PageHeader
          title="Check your crop"
          lead="Look at your photos, then press Check my crop."
        />
      )}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFiles}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={onFiles}
      />
      <div className={styles.layout} data-step={starting ? "start" : "review"}>
        <div className={styles.mainCol}>
          {starting ? (
            <StartHero
              preparing={preparing}
              onCamera={() => cameraInput.current?.click()}
              onGallery={() => galleryInput.current?.click()}
              onDrop={(files) => void addPhotos(files)}
            />
          ) : (
            <>
              <PhotoTray
                photos={photos}
                busy={busy}
                onRemove={removePhoto}
                onAdd={() => galleryInput.current?.click()}
              />
              {photos.length > 1 && (
                <SamePlantChoice
                  mode={mode}
                  busy={busy}
                  onChange={(next) => {
                    setMode(next);
                    changed();
                  }}
                />
              )}
              <MoreDetails
                details={details}
                busy={busy}
                onChange={(next) => {
                  setDetails(next);
                  changed();
                }}
              />
            </>
          )}
          {error && <ErrorNotice message={error} />}
          <p className="sr-only" role="status">
            {progress}
          </p>
          {!starting && (
            <div className={styles.submit}>
              <p className={styles.submitNote}>
                OpenAI checks your photos. Upload crop-only photos without
                people or personal details.
              </p>
              <button
                type="button"
                className="btn btn-big btn-block"
                disabled={
                  busy || (checksLeft !== null && reportCount > checksLeft)
                }
                aria-busy={Boolean(progress)}
                onClick={() => void submit()}
              >
                {progress ? (
                  <CircleNotch
                    className="spin"
                    size={26}
                    weight="bold"
                    aria-hidden
                  />
                ) : (
                  <Scan size={28} weight="bold" aria-hidden />
                )}
                {progress ||
                  (reportCount > 1
                    ? `Check ${reportCount} photos`
                    : "Check my crop")}
              </button>
              <p className={styles.submitNote}>
                {checksNote(reportCount, checksLeft, photos.length > 1)}
              </p>
            </div>
          )}
        </div>
        {starting && (
          <aside className={styles.side}>
            {usage && <ChecksLeft usage={usage} />}
            <PhotoTips />
            <RecentReports />
          </aside>
        )}
      </div>
    </>
  );
}

function checksNote(needed: number, left: number | null, canGroup: boolean) {
  if (left === null)
    return `Uses ${needed} of your ${DAILY_CHECKS} checks for today.`;
  if (left === 0) return "You have no checks left today. Come back tomorrow.";
  if (needed > left)
    return `You have only ${left} ${left === 1 ? "check" : "checks"} left today.${canGroup ? " Choose “Same plant” or remove some photos." : ""}`;
  return `Uses ${needed} of your ${left} ${left === 1 ? "check" : "checks"} left today.`;
}

/** The first screen: a real crop photo with the two ways to add one on top. */
function StartHero({
  preparing,
  onCamera,
  onGallery,
  onDrop,
}: {
  preparing: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onDrop: (files: FileList) => void;
}) {
  return (
    <section
      className={`${styles.hero} rise`}
      style={order(1)}
      aria-labelledby="hero-title"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!preparing) onDrop(e.dataTransfer.files);
      }}
    >
      <Image
        src={heroPhoto}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="(min-width: 1000px) 640px, 100vw"
        className={styles.heroImg}
      />
      <div className={styles.heroBody}>
        <p id="hero-title" className={styles.heroText}>
          Take a close photo of the sick leaf, fruit or stem.
        </p>
        <div className={styles.heroActions}>
          <button
            type="button"
            className="btn btn-big btn-block"
            disabled={preparing}
            aria-busy={preparing}
            onClick={onCamera}
          >
            {preparing ? (
              <CircleNotch
                className="spin"
                size={26}
                weight="bold"
                aria-hidden
              />
            ) : (
              <Camera size={28} weight="bold" aria-hidden />
            )}
            {preparing ? "Getting photo ready…" : "Take a photo"}
          </button>
          <button
            type="button"
            className="btn btn-glass btn-big btn-block"
            disabled={preparing}
            onClick={onGallery}
          >
            <Images size={26} weight="bold" aria-hidden /> Choose from gallery
          </button>
        </div>
        <p className={styles.heroNote}>
          You can add up to {MAX_PHOTOS} photos of one plant.
        </p>
      </div>
    </section>
  );
}

function PhotoTray({
  photos,
  busy,
  onRemove,
  onAdd,
}: {
  photos: Photo[];
  busy: boolean;
  onRemove: (photo: Photo) => void;
  onAdd: () => void;
}) {
  return (
    <section className={`${styles.panel} rise`} aria-labelledby="tray-title">
      <div className={styles.sectionHead}>
        <h2 id="tray-title" className={styles.sectionTitle}>
          Your photos
        </h2>
        <span className={styles.count}>
          {photos.length} of {MAX_PHOTOS}
        </span>
      </div>
      <ul className={styles.photos}>
        {photos.map((photo, i) => (
          <li key={photo.key} className={styles.photo}>
            <img src={photo.url} alt={`Photo ${i + 1}`} />
            <button
              type="button"
              className={styles.remove}
              disabled={busy}
              onClick={() => onRemove(photo)}
              aria-label={`Remove photo ${i + 1}`}
            >
              <X size={22} weight="bold" aria-hidden />
            </button>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li>
            <button
              type="button"
              className={styles.addTile}
              disabled={busy}
              onClick={onAdd}
            >
              <ImageSquare size={34} weight="duotone" aria-hidden />
              Add photo
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

const PLANT_OPTIONS: {
  value: Mode;
  title: string;
  text: string;
  plants: number;
}[] = [
  { value: "same", title: "Same plant", text: "One report", plants: 1 },
  {
    value: "separate",
    title: "Different plants",
    text: "One report for each photo",
    plants: 2,
  },
];

function SamePlantChoice({
  mode,
  busy,
  onChange,
}: {
  mode: Mode;
  busy: boolean;
  onChange: (mode: Mode) => void;
}) {
  return (
    <fieldset className={`${styles.choice} rise`} disabled={busy}>
      <legend>Are these photos of the same plant?</legend>
      <div className={styles.choiceGrid}>
        {PLANT_OPTIONS.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="plants"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.optionArt} aria-hidden="true">
              {Array.from({ length: option.plants }, (_, i) => (
                <Plant key={i} size={34} weight="duotone" />
              ))}
            </span>
            <strong>{option.title}</strong>
            <small>{option.text}</small>
            <span className={styles.tick} aria-hidden="true">
              <Check size={16} weight="bold" />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MoreDetails({
  details,
  busy,
  onChange,
}: {
  details: Details;
  busy: boolean;
  onChange: (details: Details) => void;
}) {
  const field =
    (name: keyof Details) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...details, [name]: e.target.value });
  return (
    <details className={`${styles.details} rise`}>
      <summary>
        <span>
          Add crop name or notes
          <span className={styles.optional}>You can skip this</span>
        </span>
        <CaretDown
          className={styles.chevron}
          size={22}
          weight="bold"
          aria-hidden
        />
      </summary>
      <fieldset className={styles.detailsBody} disabled={busy}>
        <label className="field">
          Crop name
          <input
            className="input"
            placeholder="For example: Tomato"
            maxLength={80}
            value={details.crop}
            onChange={field("crop")}
          />
        </label>
        <label className="field">
          Village or district
          <input
            className="input"
            placeholder="For example: Nashik"
            maxLength={120}
            value={details.location}
            onChange={field("location")}
          />
        </label>
        <label className="field">
          What have you noticed?
          <textarea
            className="input"
            placeholder="For example: Yellow spots on the lower leaves for 3 days"
            maxLength={500}
            rows={3}
            value={details.notes}
            onChange={field("notes")}
          />
        </label>
      </fieldset>
    </details>
  );
}

function ChecksLeft({ usage }: { usage: DailyUsage }) {
  const left = Math.max(0, usage.limit - usage.used);
  return (
    <section
      className={`${styles.checks} rise`}
      style={order(2)}
      aria-labelledby="checks-title"
    >
      <div>
        <h2 id="checks-title" className={styles.checksTitle}>
          Checks left today
        </h2>
        <p className={styles.checksHint}>
          {left ? "Each report uses one." : "Come back tomorrow for more."}
        </p>
      </div>
      <div className={styles.checksCount}>
        <span className={styles.checksBars} aria-hidden="true">
          {Array.from({ length: usage.limit }, (_, i) => (
            <span key={i} data-on={i < left || undefined} />
          ))}
        </span>
        {left} of {usage.limit}
      </div>
    </section>
  );
}

const TIPS: { photo: StaticImageData; icon: Icon; text: string }[] = [
  { photo: tipClose, icon: Crosshair, text: "Go close to the problem" },
  { photo: tipDaylight, icon: Sun, text: "Take it in daylight" },
  { photo: tipOnePlant, icon: Plant, text: "One plant at a time" },
];

function PhotoTips() {
  return (
    <section className="rise" style={order(3)} aria-labelledby="tips-title">
      <div className={styles.sectionHead}>
        <h2 id="tips-title" className={styles.sectionTitle}>
          For a good photo
        </h2>
      </div>
      <ul className={styles.tips}>
        {TIPS.map(({ photo, icon: TipIcon, text }) => (
          <li key={text} className={styles.tip}>
            <Image
              src={photo}
              alt=""
              placeholder="blur"
              sizes="(min-width: 1000px) 150px, 60vw"
              className={styles.tipImg}
            />
            <span className={styles.tipLabel}>
              <TipIcon size={22} weight="bold" aria-hidden />
              {text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentReports() {
  const { data } = useApi<{ inspections: InspectionSummary[] }>(
    "/api/inspections?page=0&limit=3",
  );
  const recent = data?.inspections ?? [];
  if (!recent.length) return null;
  return (
    <section className="rise" style={order(4)} aria-labelledby="recent-title">
      <div className={styles.sectionHead}>
        <h2 id="recent-title" className={styles.sectionTitle}>
          Recent reports
        </h2>
        <Link href="/reports" className={styles.seeAll}>
          See all
        </Link>
      </div>
      <ReportList items={recent} />
    </section>
  );
}
