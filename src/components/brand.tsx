import Link from "next/link";
import styles from "./brand.module.css";

/** The logo: a new leaf seen through a camera viewfinder. */
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="#134a33" />
      <path
        d="M7 13V7h6m10 0h6v6m0 10v6h-6m-10 0H7v-6"
        fill="none"
        stroke="#d4f06a"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 24.5c0-7.5 5-13 13-13 0 7.5-5 13-13 13Z" fill="#d4f06a" />
      <path
        d="M11.5 24.5 20 16"
        stroke="#134a33"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ onPhoto = false }: { onPhoto?: boolean }) {
  return (
    <Link
      href="/"
      className={`${styles.brand} ${onPhoto ? styles.onPhoto : ""}`}
    >
      <Mark />
      CropDoc
    </Link>
  );
}
