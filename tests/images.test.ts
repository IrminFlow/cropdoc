import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimizeImage, limitedForm } from "@/lib/images";
describe("image boundary", () => {
  it("decodes, normalizes and strips metadata", async () => {
    const bytes = await sharp({
      create: { width: 1800, height: 1000, channels: 3, background: "green" },
    })
      .withExif({ IFD0: { Copyright: "private" } })
      .png()
      .toBuffer();
    const result = await optimizeImage(bytes);
    const meta = await sharp(result.data).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });
  it("rejects disguised non-images and oversized files", async () => {
    await expect(
      optimizeImage(Buffer.from("<svg><script>alert(1)</script></svg>")),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(optimizeImage(Buffer.alloc(800001))).rejects.toThrow();
  });
  it("rejects oversized streamed requests without trusting content-length", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(3_500_001));
        c.close();
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
    await expect(limitedForm(request)).rejects.toMatchObject({ status: 413 });
  });
});
