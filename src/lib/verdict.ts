// Plain-language wording for reports. Every colour on screen comes with one
// of these words, so the meaning never depends on colour alone.
import type { CropReport } from "./report";
import type { InspectionStatus } from "./types";

export type Tone =
  "healthy" | "small" | "medium" | "serious" | "unknown" | "neutral";

/** Severity in plain words, with a 0–3 level for the meter (null = unknown). */
export const SEVERITY: Record<
  CropReport["severity"],
  { label: string; tone: Tone; level: number | null }
> = {
  None: { label: "Looks healthy", tone: "healthy", level: 0 },
  Low: { label: "Small problem", tone: "small", level: 1 },
  Moderate: { label: "Medium problem", tone: "medium", level: 2 },
  High: { label: "Serious problem", tone: "serious", level: 3 },
  Unknown: { label: "Not sure", tone: "unknown", level: null },
};

export const CONFIDENCE: Record<
  CropReport["confidence"],
  { label: string; dots: number }
> = {
  Low: { label: "Not very sure", dots: 1 },
  Medium: { label: "Fairly sure", dots: 2 },
  High: { label: "Very sure", dots: 3 },
};

/**
 * Shown in the history for reports that have no result yet. An upload that
 * is still "uploading" by the time the list loads has almost always stopped.
 */
export const STATUS: Record<InspectionStatus, { label: string; tone: Tone }> = {
  uploading: { label: "Not finished", tone: "unknown" },
  ready: { label: "Not checked yet", tone: "neutral" },
  analyzing: { label: "Checking now", tone: "neutral" },
  complete: { label: "Done", tone: "neutral" },
  failed: { label: "Check did not finish", tone: "unknown" },
  deleting: { label: "Deleting", tone: "neutral" },
};

export const FIELD_LABELS = {
  symptoms: "What we see",
  likely_issue: "Possible problem",
  treatment: "What to do now",
  home_remedy: "Home remedy",
  prevention: "Stop it coming back",
  expert_help: "When to get help",
} as const satisfies Partial<Record<keyof CropReport, string>>;

/** "Possible problem" reads oddly above "No disease seen", so healthy plants get a neutral heading. */
export function issueLabel(severity: CropReport["severity"]) {
  return severity === "None" ? "What we found" : FIELD_LABELS.likely_issue;
}

/** Kisan Call Centre: the free Government of India helpline for farmers. */
export const KISAN_HELPLINE = {
  display: "1800-180-1551",
  href: "tel:18001801551",
};

export const REPORT_CAVEAT =
  "CropDoc can be wrong. For a serious problem, ask a local farm expert.";

const sentence = (text: string) => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** The report as a short script for reading aloud. */
export function reportSpeech(report: CropReport): string {
  const parts = [
    report.crop,
    SEVERITY[report.severity].label,
    `${issueLabel(report.severity)}: ${report.likely_issue}`,
    `We are ${CONFIDENCE[report.confidence].label.toLowerCase()}`,
    `${FIELD_LABELS.treatment}: ${report.treatment}`,
    report.home_remedy && `${FIELD_LABELS.home_remedy}: ${report.home_remedy}`,
    `${FIELD_LABELS.prevention}: ${report.prevention}`,
    report.expert_help && `${FIELD_LABELS.expert_help}: ${report.expert_help}`,
    REPORT_CAVEAT,
  ];
  return parts
    .filter((part): part is string => Boolean(part))
    .map(sentence)
    .join(" ");
}
