import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyzePhotos, geminiKey } from "@/lib/gemini";
const report = {
  crop: "Unknown",
  symptoms: "Photo is unclear.",
  likely_issue: "Cannot identify from this photo.",
  confidence: "Low",
  severity: "Unknown",
  treatment: "Take a clear leaf photo.",
  home_remedy: null,
  prevention: "Check plants often.",
  expert_help: "Ask a local farm expert if damage spreads.",
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function completed(value: unknown) {
  return Response.json({
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(value) }],
      },
    ],
  });
}
it("sends only crop context and optimized images to the fixed model without tools or storage", async () => {
  fetchMock.mockResolvedValue(completed(report));
  expect(
    await analyzePhotos("test-key", ["one", "two"], "Tomato", "Yellow leaves"),
  ).toEqual(report);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  expect(options.redirect).toBe("error");
  const body = JSON.parse(options.body);
  expect(body.model).toBe("gemini-3.8-flash");
  expect(body.store).toBe(false);
  expect(body.tools).toBeUndefined();
  expect(body.input).toEqual([
    {
      type: "text",
      text: JSON.stringify({ crop: "Tomato", notes: "Yellow leaves" }),
    },
    { type: "image", data: "one", mime_type: "image/jpeg" },
    { type: "image", data: "two", mime_type: "image/jpeg" },
  ]);
});
it.each([429, 401, 403, 500])(
  "does not retry or fall back after HTTP %i",
  async (status) => {
    fetchMock.mockResolvedValue(new Response("provider failure", { status }));
    await expect(
      analyzePhotos("test-key", ["image"], "", ""),
    ).rejects.toMatchObject({
      code: status === 429 ? "AI_QUOTA" : "AI_PROVIDER",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { status: "incomplete", steps: [] },
  {
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "refusal" }] }],
  },
  { status: "completed", steps: [] },
])("rejects incomplete, empty and refused results", async (result) => {
  fetchMock.mockResolvedValue(Response.json(result));
  await expect(analyzePhotos("test-key", ["image"], "", "")).rejects.toThrow();
});
it.each([
  { ...report, severity: "invented" },
  {
    ...report,
    crop: "word ".repeat(30),
    symptoms: "word ".repeat(40),
    treatment: "word ".repeat(40),
  },
  { ...report, extra: true },
])("rejects invalid or excessive reports", async (value) => {
  fetchMock.mockResolvedValue(completed(value));
  await expect(analyzePhotos("test-key", ["image"], "", "")).rejects.toThrow();
});
it("requires credentials and verified free-project configuration before any call", () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(() => geminiKey()).toThrow();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_FREE_TIER_VERIFIED", "false");
  expect(() => geminiKey()).toThrow();
  vi.stubEnv("GEMINI_FREE_TIER_VERIFIED", "true");
  vi.stubEnv("GEMINI_PROJECT_ID", "dedicated-project");
  vi.stubEnv("GEMINI_MODEL", "different-model");
  expect(() => geminiKey()).toThrow();
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
  expect(geminiKey()).toBe("test-key");
  expect(fetchMock).not.toHaveBeenCalled();
});
