import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  Camera,
  ListChecks,
  Phone,
  Scan,
  ShieldCheck,
  SpeakerHigh,
} from "@phosphor-icons/react/ssr";
import welcomePhoto from "@/assets/photos/welcome.jpg";
import { Brand } from "@/components/brand";
import { SeverityChip, SeverityMeter } from "@/components/verdict";
import { REPORT_CAVEAT } from "@/lib/verdict";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  title: { absolute: "CropDoc: check your crop with a photo" },
};

const STEPS = [
  { icon: Camera, text: "Take a photo of the sick plant" },
  { icon: Scan, text: "Wait about half a minute" },
  { icon: ListChecks, text: "See what is wrong and what to do" },
];

const PROMISES = [
  { icon: ShieldCheck, text: "Your reports are saved for you" },
  { icon: SpeakerHigh, text: "Listen to your report" },
  { icon: Phone, text: "Free helpline to talk to an expert" },
];

const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function Home() {
  if ((await auth()).userId) redirect("/upload");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <Link href="/sign-in" className="btn btn-ghost btn-small">
          Sign in
        </Link>
      </header>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={`${styles.copy} rise`}>
            <h1>Is your crop sick?</h1>
            <p className={styles.sub}>
              Take one photo of the leaf. CropDoc tells you what may be wrong
              and what to do next.
            </p>
            <div className={styles.ctas}>
              <Link href="/sign-up" className="btn btn-big">
                <Camera size={26} weight="bold" aria-hidden /> Start for free
              </Link>
              <Link href="/sign-in" className="btn btn-ghost btn-big">
                Sign in
              </Link>
            </div>
          </div>
          <div className={`${styles.media} rise`} style={order(1)}>
            <div className={styles.frame}>
              <Image
                src={welcomePhoto}
                alt="A woman planting rice seedlings in a green field"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 900px) 46vw, 100vw"
                className={styles.photo}
              />
            </div>
            {/* A real report card, as the grower will see it. */}
            <div
              className={`${styles.preview} rise`}
              style={order(3)}
              data-tone="medium"
              aria-hidden="true"
            >
              <div className={styles.previewHead}>
                <strong>Tomato</strong>
                <SeverityChip severity="Moderate" />
              </div>
              <SeverityMeter severity="Moderate" />
              <p>
                <span>What to do now:</span> Pick off the spotted leaves and
                water the soil, not the leaves.
              </p>
            </div>
          </div>
        </section>

        <section
          className={`${styles.how} rise`}
          style={order(2)}
          aria-labelledby="how-title"
        >
          <h2 id="how-title">How it works</h2>
          <ol className={styles.steps}>
            {STEPS.map(({ icon: StepIcon, text }) => (
              <li key={text}>
                <span className={styles.icon}>
                  <StepIcon size={30} weight="duotone" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ol>
        </section>

        <ul className={styles.promises}>
          {PROMISES.map(({ icon: PromiseIcon, text }) => (
            <li key={text}>
              <PromiseIcon size={26} weight="duotone" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </main>
      <footer className={styles.footer}>{REPORT_CAVEAT}</footer>
    </div>
  );
}
