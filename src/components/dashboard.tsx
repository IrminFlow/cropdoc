"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowRight, ScanLine, Files, Leaf, Camera } from "lucide-react";
import { LeafArt } from "./brand";
import { api } from "@/lib/client";
import { ReportList, ErrorNotice, Loading, type ListItem } from "./common";
export function Dashboard() {
  const { user } = useUser();
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ inspections: ListItem[] }>("/api/inspections")
      .then((x) => setItems(x.inspections))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your crop companion</span>
          <h1>
            Hello{user?.firstName ? `, ${user.firstName}` : ""}. Let’s see
            what’s growing.
          </h1>
          <p>A closer look today. More confident care tomorrow.</p>
        </div>
        <span className="date-chip">
          {new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      <section className="inspect-banner">
        <div>
          <span className="eyebrow">
            <ScanLine size={16} /> A fresh perspective
          </span>
          <h2>
            Something looking
            <br />a little off?
          </h2>
          <p>
            Show us the signs. Get a short report
            <br className="desktop-only" /> with practical next steps.
          </p>
          <Link href="/upload" className="button">
            Inspect a crop <ArrowRight size={17} />
          </Link>
          <span className="banner-caption">One plant · Up to four photos</span>
        </div>
        <LeafArt />
      </section>
      <div className="overview-facts">
        <div>
          <Files />
          <span>
            <strong>
              {items
                ? items.filter((i) => i.status === "complete").length
                : "—"}
            </strong>
            Recent completed reports
          </span>
        </div>
        <div>
          <Leaf />
          <span>
            <strong>Made for the field</strong>Clear observations and care steps
          </span>
        </div>
        <div>
          <Camera />
          <span>
            <strong>Your photos stay yours</strong>Visible only in your account
          </span>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Recent inspections</h2>
            <p>A little history of what you’re growing.</p>
          </div>
          <Link className="text-link" href="/reports">
            All reports <ArrowRight size={16} />
          </Link>
        </div>
        {error ? (
          <ErrorNotice message={error} />
        ) : items ? (
          <ReportList items={items.slice(0, 5)} />
        ) : (
          <Loading />
        )}
      </section>
      <div className="photo-tip">
        <span>For a clearer assessment</span>
        <p>
          Use natural light, keep the affected area in focus, and include a
          wider view of the plant.
        </p>
      </div>
    </>
  );
}
