import { describe, it, expect } from "vitest";
import { validateReport, validateStoredReport } from "@/lib/report";
const uncertain = {
  crop: "Unknown",
  disease: "Not sure",
  cause: "Unknown",
  symptoms: "Image is too blurry to assess.",
  likely_issue: "Cannot identify from this photo.",
  confidence: "Low",
  severity: "Unknown",
  spread_risk: "Unknown",
  treatment: "Take a clear photo in daylight.",
  chemical_treatment: null,
  home_remedy: null,
  safety: null,
  prevention: "Monitor the plant.",
  expert_help: "Ask a local agricultural expert if symptoms persist.",
};
describe("saved reports", () => {
  it("still open reports saved before the newer fields existed", () => {
    const older: Record<string, unknown> = { ...uncertain };
    for (const key of [
      "disease",
      "cause",
      "spread_risk",
      "chemical_treatment",
      "safety",
    ])
      delete older[key];
    expect(validateStoredReport(older)).toEqual(older);
    expect(() => validateReport(older)).toThrow();
  });
});
describe("report validation", () => {
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
      validateReport({ ...uncertain, treatment: "word ".repeat(250) }),
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
