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
vi.mock("@/lib/gemini", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    geminiKey: () => "test-only-key",
    analyzePhotos: mocks.parse,
  };
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
    name === "claim_free_analysis"
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
  it("saves validated output and excludes location and account identifiers", async () => {
    mocks.parse.mockResolvedValue(report);
    await analyzeInspection(identity, id);
    expect(mocks.parse).toHaveBeenCalledWith(
      "test-only-key",
      [Buffer.from("photo").toString("base64")],
      "",
      "",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_free_analysis",
      expect.objectContaining({ p_report: report }),
    );
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("p_cost");
  });
  it("saves recoverable failure when provider outcome is unknown", async () => {
    mocks.parse.mockRejectedValue(new Error("timeout"));
    await analyzeInspection(identity, id);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_free_analysis",
      expect.objectContaining({
        p_report: null,
        p_error_code: "ANALYSIS_FAILED",
      }),
    );
  });
  it("persists quota failure before returning AI_QUOTA", async () => {
    const { AppError } = await import("@/lib/errors");
    mocks.parse.mockRejectedValue(new AppError("AI_QUOTA", "Try later", 429));
    await expect(analyzeInspection(identity, id)).rejects.toMatchObject({
      code: "AI_QUOTA",
      status: 429,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_free_analysis",
      expect.objectContaining({ p_report: null, p_error_code: "AI_QUOTA" }),
    );
  });
  it("does not call Google when daily quota admission fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "DAILY_QUOTA" },
    });
    await expect(analyzeInspection(identity, id)).rejects.toMatchObject({
      code: "DAILY_QUOTA",
    });
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("does not repeat an already claimed analysis", async () => {
    mocks.rpc.mockResolvedValue({ data: { acquired: false }, error: null });
    await analyzeInspection(identity, id);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});
