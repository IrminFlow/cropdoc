const FALLBACK_ERROR = "Something went wrong. Please try again.";

/** Calls a CropDoc API route. Errors carry a message that is safe to show. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new Error("No internet connection. Check your signal and try again.");
  }
  if (response.status === 204) return undefined as T;
  // Gateways can answer with HTML, so a JSON body is not guaranteed.
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? FALLBACK_ERROR);
  if (data === null) throw new Error(FALLBACK_ERROR);
  return data as T;
}

/** A random id. crypto.randomUUID needs HTTPS, which a phone testing over the local network lacks. */
export function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const DAY_MS = 86_400_000;

/** "Today", "Yesterday", "12 Sep", or "12 Sep 2025" for older years. */
export function dateLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Shrinks a photo in the browser so it uploads quickly on a slow network. */
export async function compressPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "This file is not a photo. Choose a JPG, PNG or WebP photo.",
    );
  if (file.size > 20_000_000)
    throw new Error("This photo is too big. Choose one smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("This photo is too big. Choose one under 40 megapixels.");
  }
  // The server re-saves every photo as a quality-80 JPEG and refuses results
  // over 800 KB, so lowering quality here would not help. Shrink instead.
  try {
    for (const edge of [1600, 1400, 1200, 1000]) {
      const blob = await drawJpeg(bitmap, edge, 0.8);
      if (blob.size <= 700_000)
        return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
    }
  } finally {
    bitmap.close();
  }
  throw new Error("This photo has too much detail. Take a closer photo.");
}

function drawJpeg(bitmap: ImageBitmap, longestEdge: number, quality: number) {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    longestEdge / Math.max(bitmap.width, bitmap.height),
  );
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d")!;
  // Transparent PNG areas would otherwise turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("This photo could not be read.")),
      "image/jpeg",
      quality,
    ),
  );
}
