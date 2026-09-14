import {
  CheckCircle,
  CircleNotch,
  Info,
  Question,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/ssr";
import type { IconWeight } from "@phosphor-icons/react";
import type { CropReport } from "@/lib/report";
import type { InspectionStatus } from "@/lib/types";
import { CONFIDENCE, SEVERITY, STATUS } from "@/lib/verdict";
import styles from "./verdict.module.css";

type Severity = CropReport["severity"];

const SEVERITY_ICON = {
  None: CheckCircle,
  Low: Info,
  Moderate: Warning,
  High: WarningOctagon,
  Unknown: Question,
} as const;

export function SeverityIcon({
  severity,
  size = 24,
  weight = "fill",
}: {
  severity: Severity;
  size?: number;
  weight?: IconWeight;
}) {
  const Icon = SEVERITY_ICON[severity];
  return <Icon size={size} weight={weight} aria-hidden />;
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const { label, tone } = SEVERITY[severity];
  return (
    <span className={styles.chip} data-tone={tone}>
      <SeverityIcon severity={severity} size={18} />
      {label}
    </span>
  );
}

export function StatusChip({ status }: { status: InspectionStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <span className={styles.chip} data-tone={tone}>
      {status === "analyzing" && (
        <CircleNotch className="spin" size={18} weight="bold" aria-hidden />
      )}
      {label}
    </span>
  );
}

/** Four bars that fill from green to red as the problem gets worse. */
export function SeverityMeter({
  severity,
  animate = false,
}: {
  severity: Severity;
  animate?: boolean;
}) {
  const { level } = SEVERITY[severity];
  if (level === null) return null;
  return (
    <div
      className={styles.meter}
      data-animate={animate || undefined}
      aria-hidden="true"
    >
      <div className={styles.meterBars}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            data-filled={i <= level || undefined}
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
      </div>
      <div className={styles.meterScale}>
        <span>Healthy</span>
        <span>Serious</span>
      </div>
    </div>
  );
}

export function ConfidenceDots({
  confidence,
}: {
  confidence: CropReport["confidence"];
}) {
  const { label, dots } = CONFIDENCE[confidence];
  return (
    <span className={styles.confidence}>
      <span className={styles.dots} aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} data-on={i <= dots || undefined} />
        ))}
      </span>
      {label}
    </span>
  );
}
