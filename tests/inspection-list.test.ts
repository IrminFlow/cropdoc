import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  bucket: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  // History and usage reads must go through the caller's RLS client.
  adminDb: () => {
    throw new Error("unexpected service-role access");
  },
  env: () => "test-only-key",
}));
import { dailyUsage, indiaDay, listInspections } from "@/lib/inspections";
import { DAILY_CHECKS, REPORTS_PAGE_SIZE } from "@/lib/limits";
import type { Identity } from "@/lib/auth";
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
type Call = [string, unknown[]];
function query(result: unknown) {
  const calls: Call[] = [];
  const q: { [k: string]: unknown } = { calls };
  for (const key of ["select", "eq", "order", "range"])
    q[key] = (...args: unknown[]) => {
      calls.push([key, args]);
      return q;
    };
  q.maybeSingle = () => Promise.resolve(result);
  q.then = (
    resolve: (x: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return q as { calls: Call[] };
}
function respond(result: unknown) {
  const q = query(result);
  mocks.from.mockReturnValue(q);
  return q;
}
const identity = {
  owner: "user_test",
  device: null,
  db: { from: mocks.from, storage: { from: mocks.bucket } },
} as unknown as Identity;
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "complete",
  crop_hint: "Tomato",
  created_at: "2026-09-10T10:00:00Z",
  image_count: 1,
  error_message: null,
  analysis_reports: null,
  inspection_images: [],
  ...extra,
});
const summary = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "complete",
  crop_hint: "Tomato",
  created_at: "2026-09-10T10:00:00Z",
  image_count: 1,
  error_message: null,
  report: null,
  thumbnail_url: null,
  ...extra,
});
const photo = (id: string, position = 0) => ({
  path: `user_test/${id}/${position}.jpg`,
  position,
});
const signed = (path: string) => `https://signed.test/${path}`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bucket.mockReturnValue({ createSignedUrls: mocks.sign });
  mocks.sign.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({
      path,
      error: null,
      signedURL: signed(path),
      signedUrl: signed(path),
    })),
    error: null,
  }));
});
afterEach(() => {
  vi.useRealTimers();
});
describe("listInspections", () => {
  it("reads the owner's newest inspections with reports and photos", async () => {
    const q = respond({ data: [], error: null });
    await expect(listInspections(identity, 0)).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith("inspections");
    expect(q.calls).toEqual([
      [
        "select",
        [
          expect.stringMatching(
            /analysis_reports\(report\).*inspection_images\(path,position\)/,
          ),
        ],
      ],
      ["eq", ["owner_id", "user_test"]],
      ["order", ["created_at", { ascending: false }]],
      ["range", [0, REPORTS_PAGE_SIZE - 1]],
    ]);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("flattens reports and signs every row's lowest-position photo in one call", async () => {
    respond({
      data: [
        row("a", {
          image_count: 3,
          analysis_reports: { report },
          inspection_images: [photo("a", 2), photo("a", 0), photo("a", 1)],
        }),
        row("b", {
          analysis_reports: [{ report }],
          inspection_images: [photo("b")],
        }),
        row("c", {
          status: "failed",
          error_message: "Analysis could not be completed.",
          analysis_reports: [],
          inspection_images: [],
        }),
        row("d", { status: "uploading", inspection_images: null }),
      ],
      error: null,
    });
    const list = await listInspections(identity, 0);
    expect(mocks.bucket).toHaveBeenCalledWith("crop-images");
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledWith(
      ["user_test/a/0.jpg", "user_test/b/0.jpg"],
      300,
    );
    expect(list).toStrictEqual([
      summary("a", {
        image_count: 3,
        report,
        thumbnail_url: signed("user_test/a/0.jpg"),
      }),
      summary("b", { report, thumbnail_url: signed("user_test/b/0.jpg") }),
      summary("c", {
        status: "failed",
        error_message: "Analysis could not be completed.",
      }),
      summary("d", { status: "uploading" }),
    ]);
  });
  it("maps signed URLs back by path and leaves unsigned photos empty", async () => {
    respond({
      data: [
        row("a", { inspection_images: [photo("a")] }),
        row("b", { inspection_images: [photo("b")] }),
      ],
      error: null,
    });
    mocks.sign.mockResolvedValue({
      data: [
        {
          path: "user_test/b/0.jpg",
          error: null,
          signedURL: "https://signed.test/b",
          signedUrl: "https://signed.test/b",
        },
        {
          path: "user_test/a/0.jpg",
          error: "Object not found",
          signedURL: null,
          signedUrl: null,
        },
      ],
      error: null,
    });
    const list = await listInspections(identity, 0);
    expect(list.map((x) => x.thumbnail_url)).toEqual([
      null,
      "https://signed.test/b",
    ]);
  });
  it.each([
    [
      "returns an error",
      () =>
        mocks.sign.mockResolvedValue({
          data: null,
          error: { name: "StorageError", message: "unavailable" },
        }),
    ],
    [
      "throws",
      () => mocks.sign.mockRejectedValue(new TypeError("fetch failed")),
    ],
  ])("still returns the list when batch signing %s", async (_, failSigning) => {
    failSigning();
    respond({
      data: [
        row("a", {
          analysis_reports: { report },
          inspection_images: [photo("a")],
        }),
        row("b", { inspection_images: [photo("b")] }),
      ],
      error: null,
    });
    await expect(listInspections(identity, 0)).resolves.toStrictEqual([
      summary("a", { report }),
      summary("b"),
    ]);
  });
  it("returns null for stored reports that no longer validate", async () => {
    respond({
      data: [
        row("a", {
          analysis_reports: { report: { ...report, severity: "invented" } },
        }),
        row("b", { analysis_reports: [{ report: "not a report" }] }),
        row("c", {
          analysis_reports: [{ report: { ...report, extra: "field" } }],
        }),
        row("d", { analysis_reports: { report: null } }),
        row("e", { analysis_reports: [{ report }] }),
      ],
      error: null,
    });
    const list = await listInspections(identity, 0);
    expect(list.map((x) => x.report)).toEqual([null, null, null, null, report]);
  });
  it.each([
    [0, 0],
    [3, 3],
    [2.9, 2],
    [-1, 0],
    [-0.5, 0],
    [Number.NaN, 0],
    [1000, 1000],
    [1001, 1000],
    [Number.POSITIVE_INFINITY, 1000],
  ])("clamps page %s to page %i", async (page, clamped) => {
    const q = respond({ data: [], error: null });
    await listInspections(identity, page);
    const from = clamped * REPORTS_PAGE_SIZE;
    expect(q.calls).toContainEqual([
      "range",
      [from, from + REPORTS_PAGE_SIZE - 1],
    ]);
  });
  it("surfaces database errors without signing anything", async () => {
    respond({ data: null, error: { message: "connection reset" } });
    await expect(listInspections(identity, 0)).rejects.toMatchObject({
      code: "DATABASE_ERROR",
      status: 503,
    });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
describe("indiaDay", () => {
  it.each([
    ["2026-09-10T20:00:00Z", "2026-09-11"],
    ["2026-09-10T18:29:59Z", "2026-09-10"],
    ["2026-09-10T18:30:00Z", "2026-09-11"],
    ["2026-12-31T19:00:00Z", "2027-01-01"],
  ])("maps %s to %s", (iso, day) => {
    expect(indiaDay(new Date(iso))).toBe(day);
  });
  it("defaults to the current time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T20:00:00Z"));
    expect(indiaDay()).toBe("2026-09-11");
  });
});
describe("dailyUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T20:00:00Z"));
  });
  it("reads the owner's attempts for today's India date", async () => {
    const q = respond({ data: { attempts: 3 }, error: null });
    await expect(dailyUsage(identity)).resolves.toStrictEqual({
      used: 3,
      limit: DAILY_CHECKS,
    });
    expect(mocks.from).toHaveBeenCalledWith("daily_usage");
    expect(q.calls).toEqual(
      expect.arrayContaining([
        ["eq", ["owner_id", "user_test"]],
        ["eq", ["day", "2026-09-11"]],
      ]),
    );
  });
  it("reports no checks used when today has no row", async () => {
    respond({ data: null, error: null });
    await expect(dailyUsage(identity)).resolves.toStrictEqual({
      used: 0,
      limit: DAILY_CHECKS,
    });
  });
  it("never reports more than the daily limit", async () => {
    respond({ data: { attempts: DAILY_CHECKS + 4 }, error: null });
    await expect(dailyUsage(identity)).resolves.toMatchObject({
      used: DAILY_CHECKS,
    });
  });
  it("surfaces database errors", async () => {
    respond({ data: null, error: { message: "connection reset" } });
    await expect(dailyUsage(identity)).rejects.toMatchObject({
      code: "DATABASE_ERROR",
    });
  });
});
