import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  parse: vi.fn(),
  storage: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  adminDb: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
    storage: { from: () => ({ download: mocks.storage }) },
  }),
  env: () => "test-only-key",
}));
vi.mock("openai", () => {
  class APIError extends Error {
    status = 429;
  }
  class Client {
    static APIError = APIError;
    responses = { parse: mocks.parse };
  }
  return { default: Client };
});
import { analyzeInspection, inspectionView } from "@/lib/inspections";
import type { Identity } from "@/lib/auth";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const report = {
  crop: "Tomato",
  symptoms: "Yellow spots.",
  likely_issue: "Uncertain from this image.",
  confidence: "Low",
  severity: "Unknown",
  treatment: "Improve airflow.",
  home_remedy: null,
  prevention: "Monitor leaves.",
  expert_help: "Consult a local expert if spreading.",
};
function query(result: unknown) {
  const q: { [k: string]: unknown } = {};
  for (const key of ["select", "eq", "order"]) q[key] = () => q;
  q.maybeSingle = () => Promise.resolve(result);
  q.then = (resolve: (x: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return q;
}
const identity = {
  owner: "user_test",
  device: null,
  db: {
    from: (table: string) => mocks.from(table),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://example.test/private" },
          error: null,
        }),
      }),
    },
  },
} as unknown as Identity;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "claim_analysis"
      ? { data: { acquired: true, attempt_id: "attempt" }, error: null }
      : { data: true, error: null },
  );
  mocks.from.mockImplementation((table: string) =>
    query({
      data:
        table === "inspections"
          ? {
              id,
              owner_id: "user_test",
              status: "complete",
              crop_hint: "",
              location: "",
              notes: "",
              lease_until: null,
            }
          : table === "inspection_images"
            ? [{ id: "image", path: "user_test/test/0.jpg", position: 0 }]
            : { report },
      error: null,
    }),
  );
  mocks.storage.mockResolvedValue({ data: new Blob(["photo"]), error: null });
});
describe("analysis lifecycle", () => {
  it("keeps interrupted uploads accessible when a tracked object is missing", async () => {
    mocks.from.mockImplementation((table: string) =>
      query({
        data:
          table === "inspections"
            ? {
                id,
                owner_id: "user_test",
                status: "uploading",
                lease_until: "2020-01-01T00:00:00Z",
              }
            : table === "inspection_images"
              ? [{ id: "image", path: "user_test/test/0.jpg", position: 0 }]
              : null,
        error: null,
      }),
    );
    const interrupted = {
      ...identity,
      db: {
        ...identity.db,
        storage: {
          from: () => ({
            createSignedUrl: async () => ({
              data: null,
              error: { message: "Object not found" },
            }),
          }),
        },
      },
    } as unknown as Identity;
    const view = await inspectionView(interrupted, id);
    expect(view.images).toEqual([]);
    expect(view.status).toBe("uploading");
    expect(view.lease_active).toBe(false);
  });
  it("uses the requested model and saves validated structured output", async () => {
    mocks.parse.mockResolvedValue({
      status: "completed",
      output_parsed: report,
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
    await analyzeInspection(identity, id);
    expect(mocks.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.6-luna",
        store: false,
        max_output_tokens: 1500,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_analysis",
      expect.objectContaining({ p_report: report, p_cost: 320 }),
    );
  });
  it("retains the reservation when provider outcome is unknown", async () => {
    mocks.parse.mockRejectedValue(new Error("timeout"));
    await analyzeInspection(identity, id);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_analysis",
      expect.objectContaining({ p_report: null, p_cost: null }),
    );
  });
  it("does not save malformed reports even after a successful provider response", async () => {
    mocks.parse.mockResolvedValue({
      status: "completed",
      output_parsed: { ...report, severity: "invented" },
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
    await analyzeInspection(identity, id);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_analysis",
      expect.objectContaining({ p_report: null, p_cost: 320 }),
    );
  });
  it("does not call OpenAI when quota admission fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "BUDGET_EXHAUSTED" },
    });
    await expect(analyzeInspection(identity, id)).rejects.toMatchObject({
      code: "BUDGET_EXHAUSTED",
    });
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("does not repeat an already claimed analysis", async () => {
    mocks.rpc.mockResolvedValue({ data: { acquired: false }, error: null });
    await analyzeInspection(identity, id);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});
