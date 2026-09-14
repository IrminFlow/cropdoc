import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  webIdentity: vi.fn(),
  listInspections: vi.fn(),
  dailyUsage: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  webIdentity: mocks.webIdentity,
  sameOrigin: vi.fn(),
}));
vi.mock("@/lib/inspections", () => ({
  listInspections: mocks.listInspections,
  dailyUsage: mocks.dailyUsage,
  uploadInspection: vi.fn(),
}));
import { GET as listRoute } from "@/app/api/inspections/route";
import { GET as usageRoute } from "@/app/api/usage/route";
import { AppError } from "@/lib/errors";
import { REPORTS_PAGE_SIZE } from "@/lib/limits";
const identity = { owner: "user_test", device: null, db: {} };
const signedOut = new AppError(
  "UNAUTHENTICATED",
  "Please sign in to continue.",
  401,
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.webIdentity.mockResolvedValue(identity);
});
describe("GET /api/inspections", () => {
  it("returns the requested page of summaries without caching", async () => {
    const inspections = [{ id: "a", report: null, thumbnail_url: null }];
    mocks.listInspections.mockResolvedValue(inspections);
    const res = await listRoute(
      new Request("https://cropdoc.example/api/inspections?page=2"),
    );
    expect(mocks.listInspections).toHaveBeenCalledWith(
      identity,
      2,
      REPORTS_PAGE_SIZE,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ inspections });
  });
  it("treats a missing page as the first page", async () => {
    mocks.listInspections.mockResolvedValue([]);
    await listRoute(new Request("https://cropdoc.example/api/inspections"));
    expect(mocks.listInspections).toHaveBeenCalledWith(
      identity,
      0,
      REPORTS_PAGE_SIZE,
    );
  });
  it("passes a smaller limit for short lists", async () => {
    mocks.listInspections.mockResolvedValue([]);
    await listRoute(
      new Request("https://cropdoc.example/api/inspections?page=0&limit=3"),
    );
    expect(mocks.listInspections).toHaveBeenCalledWith(identity, 0, 3);
  });
  it("returns the standard error shape when signed out", async () => {
    mocks.webIdentity.mockRejectedValue(signedOut);
    const res = await listRoute(
      new Request("https://cropdoc.example/api/inspections"),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Please sign in to continue.",
      },
    });
    expect(mocks.listInspections).not.toHaveBeenCalled();
  });
});
describe("GET /api/usage", () => {
  it("returns today's usage without caching", async () => {
    mocks.dailyUsage.mockResolvedValue({ used: 2, limit: 5 });
    const res = await usageRoute();
    expect(mocks.dailyUsage).toHaveBeenCalledWith(identity);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ used: 2, limit: 5 });
  });
  it("returns the standard error shape when signed out", async () => {
    mocks.webIdentity.mockRejectedValue(signedOut);
    const res = await usageRoute();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.dailyUsage).not.toHaveBeenCalled();
  });
});
