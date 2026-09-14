import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyzePhotos, openrouterKey } from "@/lib/openrouter";
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
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
    usage: { cost: 0 },
  });
}
it("sends only crop context and optimized images to the fixed model without tools or storage", async () => {
  fetchMock.mockResolvedValue(completed(report));
  expect(
    await analyzePhotos("test-key", ["one", "two"], "Tomato", "Yellow leaves"),
  ).toEqual(report);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(options.redirect).toBe("error");
  const body = JSON.parse(options.body);
  expect(body.model).toBe("dots-studio/dots-3-note-preview:free");
  expect(body.provider).toEqual({
    allow_fallbacks: false,
    require_parameters: true,
    data_collection: "deny",
    max_price: { prompt: 0, completion: 0 },
  });
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.tools).toBeUndefined();
  expect(body.messages[1].content).toEqual([
    {
      type: "text",
      text: JSON.stringify({ crop: "Tomato", notes: "Yellow leaves" }),
    },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,one" } },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,two" } },
  ]);
});
it.each([429, 402, 401, 403, 500])(
  "does not retry or fall back after HTTP %i",
  async (status) => {
    fetchMock.mockResolvedValue(new Response("provider failure", { status }));
    await expect(
      analyzePhotos("test-key", ["image"], "", ""),
    ).rejects.toMatchObject({
      code: status === 429 || status === 402 ? "AI_QUOTA" : "AI_PROVIDER",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it.each([
  {
    choices: [{ finish_reason: "length", message: { content: "{}" } }],
    usage: { cost: 0 },
  },
  {
    choices: [
      { finish_reason: "stop", message: { content: "{}", refusal: "No" } },
    ],
    usage: { cost: 0 },
  },
  { choices: [], usage: { cost: 0 } },
  {
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(report) } },
    ],
    usage: { cost: 1 },
  },
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
  vi.stubEnv("OPENROUTER_API_KEY", "");
  expect(() => openrouterKey()).toThrow();
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_FREE_TIER_VERIFIED", "false");
  expect(() => openrouterKey()).toThrow();
  vi.stubEnv("OPENROUTER_FREE_TIER_VERIFIED", "true");
  vi.stubEnv("OPENROUTER_MODEL", "different-model");
  expect(() => openrouterKey()).toThrow();
  vi.stubEnv("OPENROUTER_MODEL", "dots-studio/dots-3-note-preview:free");
  expect(openrouterKey()).toBe("test-key");
  expect(fetchMock).not.toHaveBeenCalled();
});
