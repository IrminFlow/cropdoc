import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  Camera,
  Check,
  ClipboardText,
  ListChecks,
  Phone,
  Play,
  Scan,
  Webcam,
  X,
} from "@phosphor-icons/react/ssr";
import badBlurry from "@/assets/photos/bad-blurry.jpg";
import badDark from "@/assets/photos/bad-dark.jpg";
import farAway from "@/assets/photos/far-away.jpg";
import tipClose from "@/assets/photos/tip-close.jpg";
import { ListenButton } from "@/components/listen";
import { PageHeader } from "@/components/ui";
import { DAILY_CHECKS } from "@/lib/limits";
import { KISAN_HELPLINE, REPORT_CAVEAT } from "@/lib/verdict";
import styles from "./help.module.css";

export const metadata: Metadata = { title: "Help" };

const STEPS = [
  {
    icon: Camera,
    title: "Take a photo",
    text: "Go close to the sick leaf, fruit or stem. Use daylight.",
  },
  {
    icon: Scan,
    title: "Press “Check my crop”",
    text: "Wait about half a minute.",
  },
  {
    icon: ListChecks,
    title: "Read what to do",
    text: "Or press “Listen to report” to hear it.",
  },
  {
    icon: ClipboardText,
    title: "Find it again later",
    text: "Every report is saved in My reports.",
  },
];

const EXAMPLES: { photo: StaticImageData; good: boolean; label: string }[] = [
  { photo: tipClose, good: true, label: "Close and sharp" },
  { photo: badBlurry, good: false, label: "Blurry" },
  { photo: badDark, good: false, label: "Too dark" },
  { photo: farAway, good: false, label: "Too far away" },
];

const FACTS = [
  `You can get ${DAILY_CHECKS} reports each day.`,
  "Other CropDoc users cannot see your photos or reports. OpenAI checks your photos. Upload crop-only photos without people or personal details.",
  "You can delete a report at any time.",
  REPORT_CAVEAT,
];

const stepsSpeech = STEPS.map(
  (step, i) =>
    `Step ${i + 1}. ${step.title.replace(/[“”]/g, "")}. ${step.text}`,
).join(" ");

const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function Page() {
  return (
    <>
      <PageHeader title="Help" lead="How CropDoc works, and who to ask." />
      <div className={styles.grid}>
        <section
          className={`${styles.panel} rise`}
          style={order(1)}
          aria-labelledby="steps-title"
        >
          <div className={styles.head}>
            <h2 id="steps-title">How to check a crop</h2>
            <ListenButton text={stepsSpeech} label="Listen" />
          </div>
          <ol className={styles.steps}>
            {STEPS.map(({ icon: StepIcon, title, text }) => (
              <li key={title}>
                <span className={styles.stepIcon}>
                  <StepIcon size={28} weight="duotone" aria-hidden />
                </span>
                <span>
                  <strong>{title}</strong>
                  {text}
                </span>
              </li>
            ))}
          </ol>
          <Link href="/upload" className="btn btn-big btn-block">
            <Camera size={28} weight="bold" aria-hidden /> Check a crop now
          </Link>
        </section>

        <section
          className={`${styles.panel} rise`}
          style={order(2)}
          aria-labelledby="video-title"
        >
          <h2 id="video-title">
            <Play size={26} weight="duotone" aria-hidden /> Watch how it works
          </h2>
          <video
            className={styles.video}
            controls
            playsInline
            muted
            preload="none"
            poster="/how-to-poster.jpg"
            aria-label="Video: how to check a crop, in four steps, with no sound"
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
          <p className={styles.muted}>20 seconds. No sound.</p>
        </section>

        <section
          className={`${styles.panel} ${styles.wide} rise`}
          style={order(3)}
          aria-labelledby="photo-title"
        >
          <h2 id="photo-title">Good and bad photos</h2>
          <ul className={styles.examples}>
            {EXAMPLES.map(({ photo, good, label }) => (
              <li
                key={label}
                className={styles.example}
                data-tone={good ? "healthy" : "serious"}
              >
                <span className={styles.exampleFrame}>
                  <Image
                    src={photo}
                    alt=""
                    placeholder="blur"
                    sizes="(min-width: 700px) 25vw, 45vw"
                    className={styles.exampleImg}
                  />
                  <span className={styles.mark}>
                    {good ? (
                      <Check size={20} weight="bold" aria-hidden />
                    ) : (
                      <X size={20} weight="bold" aria-hidden />
                    )}
                  </span>
                </span>
                <span className={styles.exampleLabel}>
                  <span className="sr-only">
                    {good ? "Good:" : "Not good:"}
                  </span>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={`${styles.panel} ${styles.expert} rise`}
          style={order(4)}
          aria-labelledby="expert-title"
        >
          <h2 id="expert-title">
            <Phone size={26} weight="duotone" aria-hidden /> Talk to a farm
            expert
          </h2>
          <p>
            The Kisan helpline is free. Experts answer in many Indian languages.
          </p>
          <a className="btn btn-dark btn-block" href={KISAN_HELPLINE.href}>
            <Phone size={24} weight="fill" aria-hidden /> Call{" "}
            {KISAN_HELPLINE.display}
          </a>
        </section>

        <section
          className={`${styles.panel} rise`}
          style={order(5)}
          aria-labelledby="facts-title"
        >
          <h2 id="facts-title">Good to know</h2>
          <ul className={styles.facts}>
            {FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </section>

        <section
          className={`${styles.panel} ${styles.wide} ${styles.cameras} rise`}
          style={order(6)}
          aria-labelledby="camera-title"
        >
          <span className={styles.stepIcon}>
            <Webcam size={28} weight="duotone" aria-hidden />
          </span>
          <div>
            <h2 id="camera-title">Field cameras</h2>
            <p className={styles.muted}>
              A Raspberry Pi or a computer with a camera can send photos by
              itself.
            </p>
          </div>
          <Link href="/devices" className="btn btn-ghost">
            Set up a field camera
          </Link>
        </section>
      </div>
    </>
  );
}
