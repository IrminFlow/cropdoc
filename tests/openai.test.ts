import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ parse: vi.fn(), options: vi.fn() }));
vi.mock("openai", () => {
  class APIError extends Error {
    constructor(public status: number | undefined) {
      super("api error");
    }
  }
  class OpenAI {
    static APIError = APIError;
    responses = { parse: mocks.parse };
    constructor(options: unknown) {
      mocks.options(options);
    }
  }
  return { default: OpenAI };
});
import OpenAI from "openai";
import { analyzePhotos, openaiKey } from "@/lib/openai";

const report = {
  crop: "Tomato",
  disease: "Early blight",
  cause: "Fungus",
  symptoms: "Brown rings on lower leaves.",
  likely_issue: "A leaf disease that spreads from old leaves.",
  confidence: "Medium",
  severity: "Moderate",
  spread_risk: "Medium",
  treatment: "Remove spotted leaves and keep leaves dry.",
  chemical_treatment:
    "Spray mancozeb at the first signs. Use the dose on the product label.",
  home_remedy: "Spray neem oil every seven days.",
  safety: "Wear gloves and a mask. Follow the label's days before harvest.",
  prevention: "Water the soil, not the leaves.",
  expert_help: null,
};
const APIError = (OpenAI as unknown as { APIError: new (s?: number) => Error })
  .APIError;
function completed(
  value: unknown,
  usage = { input_tokens: 3000, output_tokens: 500 },
) {
  return { status: "completed", output_parsed: value, usage };
}
beforeEach(() => {
  mocks.parse.mockReset();
  mocks.options.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("sends only crop context and images to gpt-6-luna without storage, retries or tools", async () => {
  mocks.parse.mockResolvedValue(completed(report));
  const result = await analyzePhotos(
    "test-key",
    ["one", "two"],
    "Tomato",
    "Yellow leaves",
  );
  expect(result).toEqual({ report, cost: 550 });
  expect(mocks.options).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: "test-key", maxRetries: 0 }),
  );
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  const body = mocks.parse.mock.calls[0][0];
  expect(body.model).toBe("gpt-6-luna");
  expect(body.store).toBe(false);
  expect(body.tools).toBeUndefined();
  expect(body.text.format.strict).toBe(true);
  expect(body.input[1].content).toEqual([
    {
      type: "input_text",
      text: JSON.stringify({ crop: "Tomato", notes: "Yellow leaves" }),
    },
    {
      type: "input_image",
      image_url: "data:image/jpeg;base64,one",
      detail: "high",
    },
    {
      type: "input_image",
      image_url: "data:image/jpeg;base64,two",
      detail: "high",
    },
  ]);
});

it("charges input and output tokens at GPT-6 Luna prices, rounding up", async () => {
  mocks.parse.mockResolvedValue(
    completed(report, { input_tokens: 1001, output_tokens: 1 }),
  );
  // 1001 × 0.1 + 1 × 0.5 = 100.6 micro-dollars.
  expect((await analyzePhotos("k", ["i"], "", "")).cost).toBe(101);
});

it.each([
  [429, "AI_QUOTA"],
  [401, "AI_PROVIDER"],
  [500, "AI_PROVIDER"],
])("does not retry after HTTP %i and records no cost", async (status, code) => {
  mocks.parse.mockRejectedValue(new APIError(status));
  await expect(analyzePhotos("k", ["i"], "", "")).rejects.toMatchObject({
    code,
    cost: 0,
  });
  expect(mocks.parse).toHaveBeenCalledTimes(1);
});

it("keeps the full reservation when a timeout leaves the cost unknown", async () => {
  mocks.parse.mockRejectedValue(new APIError(undefined));
  await expect(analyzePhotos("k", ["i"], "", "")).rejects.toMatchObject({
    code: "AI_PROVIDER",
    cost: null,
  });
});

it.each([
  { status: "incomplete", output_parsed: report },
  { status: "completed", output_parsed: null },
  { status: "completed", output_parsed: { ...report, severity: "invented" } },
  { status: "completed", output_parsed: { ...report, extra: true } },
  {
    status: "completed",
    // Every field fits, but the whole report is over 220 words.
    output_parsed: {
      ...report,
      symptoms: "word ".repeat(59),
      likely_issue: "word ".repeat(59),
      treatment: "word ".repeat(59),
      prevention: "word ".repeat(59),
    },
  },
])(
  "rejects incomplete, refused and invalid reports but records their cost",
  async (response) => {
    mocks.parse.mockResolvedValue({
      ...response,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
    await expect(analyzePhotos("k", ["i"], "", "")).rejects.toMatchObject({
      code: "AI_PROVIDER",
      cost: 6,
    });
  },
);

it("requires a key and only allows gpt-6-luna before any call", () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(() => openaiKey()).toThrow();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_MODEL", "gpt-5.6-luna");
  expect(() => openaiKey()).toThrow();
  vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
  expect(openaiKey()).toBe("test-key");
  vi.stubEnv("OPENAI_MODEL", "");
  expect(openaiKey()).toBe("test-key");
  expect(mocks.parse).not.toHaveBeenCalled();
});
