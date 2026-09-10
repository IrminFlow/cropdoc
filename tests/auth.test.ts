import { describe, it, expect, vi } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
import { newDeviceToken, hashToken, sameOrigin } from "@/lib/auth";
describe("credential boundaries", () => {
  it("creates unique high-entropy tokens and stores only their digest", () => {
    const a = newDeviceToken(),
      b = newDeviceToken();
    expect(a.token).toMatch(/^cd_[\w-]{43}$/);
    expect(a.hash).toHaveLength(64);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toBe(b.hash);
    expect(a.prefix).not.toBe(a.token);
  });
  it("rejects cross-origin browser writes", () => {
    expect(() =>
      sameOrigin(
        new Request("https://cropdoc.example/api/devices", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://cropdoc.example/api/devices", {
          headers: { origin: "https://cropdoc.example" },
        }),
      ),
    ).not.toThrow();
  });
});
