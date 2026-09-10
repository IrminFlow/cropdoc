import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, Camera, ShieldCheck, Sprout } from "lucide-react";
import { Brand, LeafArt } from "@/components/brand";
export default async function Home() {
  if ((await auth()).userId) redirect("/dashboard");
  return (
    <div className="welcome">
      <header>
        <Brand />
        <Link href="/sign-in" className="button secondary">
          Sign in
        </Link>
      </header>
      <main className="welcome-main">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> A little help in the field
          </span>
          <h1>
            Healthy crops start
            <br />
            with a closer look.
          </h1>
          <p className="lead">
            A photo. A clearer picture. Practical next steps for the crops you
            care for.
          </p>
          <Link className="button" href="/sign-up">
            Check your crop <ArrowRight size={18} />
          </Link>
          <p className="fine">
            Free demo · Private photos · Short, useful reports
          </p>
        </div>
        <div className="welcome-art">
          <LeafArt />
          <span className="art-caption">Observe. Understand. Grow.</span>
        </div>
      </main>
      <div className="welcome-steps">
        {[
          [
            Camera,
            "Start with a photo",
            "Capture the leaf, fruit, or plant you’re concerned about.",
          ],
          [
            Sprout,
            "Understand the signs",
            "Get a short assessment and practical care suggestions.",
          ],
          [
            ShieldCheck,
            "Keep a private record",
            "Your photos and previous reports stay in your account.",
          ],
        ].map(([Icon, title, text]) => {
          const C = Icon as typeof Camera;
          return (
            <div key={String(title)}>
              <C size={23} />
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </div>
          );
        })}
      </div>
      <footer className="welcome-footer">
        Made for growers. AI guidance does not replace a field diagnosis.
      </footer>
    </div>
  );
}
