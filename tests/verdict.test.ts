import { describe, it, expect } from "vitest";
import { dateLabel, randomKey } from "@/lib/client";
import type { CropReport } from "@/lib/report";
import { CONFIDENCE, SEVERITY, reportSpeech } from "@/lib/verdict";

const report: CropReport = {
  crop: "Tomato",
  symptoms: "Brown spots with yellow rings on lower leaves.",
  likely_issue: "Early blight, a leaf disease caused by a fungus",
  confidence: "Medium",
  severity: "Moderate",
  treatment: "Remove the spotted leaves and keep leaves dry.",
  home_remedy: null,
  prevention: "Water the soil, not the leaves",
  expert_help: null,
};

describe("plain-language report wording", () => {
  it("gives every severity a word, a tone and a meter level", () => {
    for (const severity of Object.values(SEVERITY)) {
      expect(severity.label).toMatch(/\w/);
      expect(severity.tone).toBeTruthy();
    }
    expect(SEVERITY.None.level).toBe(0);
    expect(SEVERITY.High.level).toBe(3);
    expect(SEVERITY.Unknown.level).toBeNull();
    expect(CONFIDENCE.Low.dots).toBeLessThan(CONFIDENCE.High.dots);
  });

  it("reads the report aloud in order, as full sentences, skipping empty fields", () => {
    const speech = reportSpeech(report);
    expect(speech).toBe(
      "Tomato. Medium problem. Possible problem: Early blight, a leaf disease caused by a fungus. " +
        "We are fairly sure. What to do now: Remove the spotted leaves and keep leaves dry. " +
        "Stop it coming back: Water the soil, not the leaves. " +
        "CropDoc can be wrong. For a serious problem, ask a local farm expert.",
    );
  });

  it("does not call a healthy result a problem", () => {
    const speech = reportSpeech({
      ...report,
      severity: "None",
      likely_issue: "No disease seen",
    });
    expect(speech).toContain("Looks healthy. What we found: No disease seen.");
    expect(speech).not.toContain("Possible problem");
  });

  it("includes optional advice when the report has it", () => {
    const speech = reportSpeech({
      ...report,
      home_remedy: "Spray diluted neem oil in the evening",
      expert_help: "Call an expert if it spreads to the fruit.",
    });
    expect(speech).toContain(
      "Home remedy: Spray diluted neem oil in the evening.",
    );
    expect(speech).toContain(
      "When to get help: Call an expert if it spreads to the fruit.",
    );
  });
});

describe("date labels", () => {
  const now = new Date(2026, 8, 11, 15, 0);
  it("uses Today and Yesterday for recent reports", () => {
    expect(dateLabel(new Date(2026, 8, 11, 0, 5).toISOString(), now)).toBe(
      "Today",
    );
    expect(dateLabel(new Date(2026, 8, 10, 23, 55).toISOString(), now)).toBe(
      "Yesterday",
    );
  });
  it("shows the year only for older years", () => {
    expect(dateLabel(new Date(2026, 7, 2).toISOString(), now)).toBe("2 Aug");
    expect(dateLabel(new Date(2025, 11, 30).toISOString(), now)).toBe(
      "30 Dec 2025",
    );
  });
});

describe("random keys", () => {
  it("fit the upload Idempotency-Key format and do not repeat", () => {
    const a = randomKey();
    expect(`${a}_0`).toMatch(/^[a-zA-Z0-9_-]{16,100}$/);
    expect(randomKey()).not.toBe(a);
  });
});
