"use client";
import { useEffect, useRef } from "react";
export function HowTo() {
  const guide = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const open = () => {
      if (location.hash === "#how-to" && guide.current)
        guide.current.open = true;
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);
  return (
    <details className="how-to" id="how-to" ref={guide}>
      <summary>How to use · Watch 20 seconds</summary>
      <div>
        <video
          controls
          playsInline
          muted
          preload="none"
          poster="/how-to-poster.jpg"
          aria-label="How to check a crop: a silent, text-guided example"
        >
          <source src="/how-to.mp4" type="video/mp4" />
          <track
            kind="captions"
            src="/how-to.vtt"
            srcLang="en"
            label="English"
            default
          />
        </video>
        <p>
          1. Add a clear crop photo. 2. Tap Check crop. 3. Read the care steps.
          Find it again in My reports.
        </p>
      </div>
    </details>
  );
}
