import Link from "next/link";
export function Mark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="currentColor" />
      <path
        d="M11 23c-1-10 7-13 15-13 0 9-3 15-11 14"
        stroke="white"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m11 27 11-13m-7 9v-6m3 3h5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Brand() {
  return (
    <Link className="brand" href="/upload">
      <Mark />
      <span>
        CropDoc<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function LeafArt() {
  return (
    <svg
      className="leaf-art"
      viewBox="0 0 400 350"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="205" cy="292" rx="126" ry="15" fill="#DDE8D8" />
      <path
        d="M205 298C176 216 177 110 218 46"
        stroke="#375F39"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M193 214C101 220 72 162 78 115c83 5 117 39 115 99Z"
        fill="#6F9566"
      />
      <path
        d="M186 170C242 170 291 123 290 72c-72 5-105 51-104 98Z"
        fill="#2C6845"
      />
      <path
        d="M207 271c64 7 112-21 128-74-82-18-120 13-128 74Z"
        fill="#8FA77B"
      />
      <path
        d="m92 130 101 84m82-126-88 82m132 39-111 60"
        stroke="#F0F5E8"
        strokeWidth="1.6"
      />
      <circle cx="280" cy="78" r="43" stroke="#A1B791" strokeDasharray="4 6" />
      <path d="M264 78h32m-16-16v32" stroke="#375F39" strokeWidth="1.5" />
      <rect x="63" y="233" width="104" height="40" rx="10" fill="white" />
      <circle cx="82" cy="253" r="5" fill="#176443" />
      <path
        d="M96 248h52m-52 10h35"
        stroke="#B5C6B6"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
