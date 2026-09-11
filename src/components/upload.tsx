"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, UploadCloud, X, ArrowRight, LoaderCircle } from "lucide-react";
import { api, compressPhoto } from "@/lib/client";
import { ErrorNotice } from "./common";
import { HowTo } from "./how-to";
type Photo = { file: File; url: string; key: string };
export function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mode, setMode] = useState("group");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [crop, setCrop] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );
  function changed() {
    key.current = crypto.randomUUID();
  }
  async function add(files: FileList | null) {
    if (!files) return;
    setError("");
    if (files.length + photos.length > 4) {
      setError("Choose up to four photos at a time.");
      return;
    }
    setBusy(true);
    setStatus("Preparing your photos…");
    const added: Photo[] = [];
    try {
      for (const f of Array.from(files)) {
        const file = await compressPhoto(f);
        added.push({
          file,
          url: URL.createObjectURL(file),
          key: crypto.randomUUID(),
        });
      }
      setPhotos((p) => [...p, ...added]);
      changed();
    } catch (e) {
      added.forEach((p) => URL.revokeObjectURL(p.url));
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }
  async function submit() {
    setError("");
    setBusy(true);
    const completed: string[] = [];
    try {
      const groups = mode === "group" ? [photos] : photos.map((p) => [p]);
      for (const [index, group] of groups.entries()) {
        setStatus(
          `Uploading ${groups.length > 1 ? `photo ${index + 1} of ${groups.length}` : "your photos"}…`,
        );
        const form = new FormData();
        group.forEach((p) => form.append("images", p.file));
        form.set("crop", crop);
        form.set("location", location);
        form.set("notes", notes);
        const { inspection } = await api<{ inspection: { id: string } }>(
          "/api/inspections",
          {
            method: "POST",
            headers: { "Idempotency-Key": `${key.current}_${index}` },
            body: form,
          },
        );
        completed.push(inspection.id);
        if (groups.length === 1) {
          router.push(`/reports/${inspection.id}?analyze=1`);
          return;
        }
        setStatus(`Checking photo ${index + 1} of ${groups.length}…`);
        await api(`/api/inspections/${inspection.id}/analyze`, {
          method: "POST",
        });
      }
      router.push("/reports");
    } catch (e) {
      setError(
        `${(e as Error).message}${completed.length ? " Uploaded photos are saved in My reports." : ""}`,
      );
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Check your crop</h1>
          <p>Add a photo to find out what may be wrong and what to do.</p>
        </div>
      </div>
      <div className="simple-upload">
        <div>
          <section className="panel form-panel">
            <div className="section-heading">
              <h2>Add crop photos</h2>
              <span className="subtle">{photos.length} / 4 photos</span>
            </div>
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) void add(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={34} strokeWidth={1.4} />
              <h3>Take a clear photo of the problem.</h3>
              <p>Show the affected leaf, fruit, or stem.</p>
              <div className="button-row">
                <button
                  disabled={busy}
                  className="button secondary"
                  onClick={() => input.current?.click()}
                >
                  Add photos
                </button>
                <button
                  disabled={busy}
                  className="button ghost"
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={17} /> Take a photo
                </button>
              </div>
              <span className="fine">Up to 4 photos · JPEG, PNG or WebP</span>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => void add(e.target.files)}
              />
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void add(e.target.files)}
              />
            </div>
            {photos.length > 0 && (
              <div className="photo-grid">
                {photos.map((p) => (
                  <div className="photo-preview" key={p.key}>
                    <img src={p.url} alt="Selected crop photo" />
                    <button
                      aria-label={`Remove ${p.file.name}`}
                      disabled={busy}
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPhotos((x) => x.filter((y) => y.key !== p.key));
                        changed();
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length > 1 && (
              <fieldset className="mode-choice">
                <legend>Are these photos of the same plant?</legend>
                <label>
                  <input
                    type="radio"
                    checked={mode === "group"}
                    onChange={() => {
                      setMode("group");
                      changed();
                    }}
                    name="mode"
                    disabled={busy}
                  />
                  <span>
                    <strong>Same plant</strong>
                    <small>Get one report for these photos.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    checked={mode === "individual"}
                    onChange={() => {
                      setMode("individual");
                      changed();
                    }}
                    name="mode"
                    disabled={busy}
                  />
                  <span>
                    <strong>Different plants</strong>
                    <small>Get a separate report for each photo.</small>
                  </span>
                </label>
              </fieldset>
            )}
          </section>
          <details className="panel form-panel extra-details">
            <summary>Add crop name or other details (optional)</summary>
            <div className="field-grid">
              <label>
                Crop name
                <input
                  disabled={busy}
                  placeholder="e.g. Tomato"
                  maxLength={80}
                  value={crop}
                  onChange={(e) => {
                    setCrop(e.target.value);
                    changed();
                  }}
                />
              </label>
              <label>
                Location
                <input
                  disabled={busy}
                  placeholder="e.g. Pune, Maharashtra"
                  maxLength={120}
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    changed();
                  }}
                />
              </label>
            </div>
            <label>
              What do you see?
              <textarea
                disabled={busy}
                placeholder="e.g. Yellow spots on lower leaves for the past three days."
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  changed();
                }}
              />
            </label>
          </details>
          {error && <ErrorNotice message={error} />}
          <div className="upload-submit">
            <span className="fine">
              Uses {mode === "group" ? 1 : Math.max(1, photos.length)} of your 5
              daily checks
            </span>
            <button
              className="button"
              disabled={!photos.length || busy}
              onClick={() => void submit()}
            >
              {busy ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  {status}
                </>
              ) : (
                <>
                  Check{" "}
                  {mode === "individual" && photos.length > 1
                    ? "crops"
                    : "crop"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
          <p className="simple-privacy">
            Your photos are private. AI can be wrong. Ask a local crop expert if
            the problem is serious.
          </p>
          <HowTo />
        </div>
      </div>
    </>
  );
}
