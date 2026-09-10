export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (r.status === 204) return undefined as T;
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error?.message ?? "Request failed. Please try again.");
  return data;
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export async function compressPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 20_000_000)
    throw new Error("Please choose a photo smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("This photo is too large. Choose one under 40 megapixels.");
  }
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not optimize this photo.")),
        "image/jpeg",
        quality,
      ),
    );
    if (blob.size <= 750_000)
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
        type: "image/jpeg",
      });
  }
  throw new Error("This image is too detailed to upload. Try a closer crop.");
}
