import "server-only";
import sharp from "sharp";
import { AppError } from "./errors";
export const MAX_REQUEST_BYTES = 3_500_000;
export async function optimizeImage(bytes: Buffer) {
  if (bytes.length > 800_000 || bytes.length === 0)
    throw new AppError(
      "INVALID_IMAGE",
      "Each optimized photo must be under 800 KB.",
    );
  try {
    const input = sharp(bytes, {
      limitInputPixels: 20_000_000,
      failOn: "warning",
    });
    const meta = await input.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      throw new Error("format");
    const { data, info } = await input
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length > 800_000) throw new Error("size");
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError(
      "INVALID_IMAGE",
      "Use a valid, still JPEG, PNG, or WebP crop photo.",
    );
  }
}
export async function limitedForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new AppError("INVALID_INPUT", "Send photos as multipart form data.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES)
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      "The upload is too large. Optimize your photos first.",
      413,
    );
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_INPUT", "No upload received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new AppError("PAYLOAD_TOO_LARGE", "The upload is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new AppError("INVALID_INPUT", "The upload could not be read.");
  }
}
