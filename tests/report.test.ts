import { describe, it, expect } from "vitest";
import { validateReport } from "@/lib/report";
const uncertain = {
  crop: "Unknown",
  symptoms: "Image is too blurry to assess.",
  likely_issue: "Cannot identify from this photo.",
  confidence: "Low",
  severity: "Unknown",
  treatment: "Take a clear photo in daylight.",
  home_remedy: null,
  prevention: "Monitor the plant.",
  expert_help: "Ask a local agricultural expert if symptoms persist.",
};
describe("short report validation", () => {
  it("accepts an explicit uncertain assessment", () =>
    expect(validateReport(uncertain)).toEqual(uncertain));
  it("rejects extra fields and numeric confidence", () => {
    expect(() => validateReport({ ...uncertain, confidence: 95 })).toThrow();
    expect(() =>
      validateReport({ ...uncertain, explanation: "extra" }),
    ).toThrow();
  });
  it("rejects overlong reports and invalid severity", () => {
    expect(() =>
      validateReport({ ...uncertain, treatment: "word ".repeat(120) }),
    ).toThrow();
    expect(() =>
      validateReport({ ...uncertain, severity: "Critical" }),
    ).toThrow();
  });
  it("requires optional fields to be explicitly nullable", () => {
    const missing: Record<string, unknown> = { ...uncertain };
    delete missing.home_remedy;
    expect(() => validateReport(missing)).toThrow();
  });
});
