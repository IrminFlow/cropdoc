import { CircleNotch, WarningCircle } from "@phosphor-icons/react/ssr";
import styles from "./ui.module.css";

export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className={`${styles.pageHeader} rise`}>
      <div>
        <h1>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      <CircleNotch className="spin" size={28} weight="bold" aria-hidden />
      {label}
    </div>
  );
}

/** A grey block shaped like content that is still loading. */
export function Skeleton({
  width = "100%",
  height,
  radius,
}: {
  width?: string | number;
  height: string | number;
  radius?: string | number;
}) {
  return (
    <span
      className={`skeleton ${styles.skeleton}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.error} role="alert">
      <WarningCircle size={26} weight="fill" aria-hidden />
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
