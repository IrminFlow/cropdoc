"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  ScanLine,
  Files,
  Cable,
  ArrowUpRight,
} from "lucide-react";
import { Brand } from "./brand";
const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/upload", label: "New inspection", icon: ScanLine },
  { href: "/reports", label: "My reports", icon: Files },
  { href: "/devices", label: "Devices", icon: Cable },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">Your growing space</div>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={`nav-link ${path.startsWith(href) ? "active" : ""}`}
              href={href}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path.startsWith(href) && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="status-dot" /> Demo workspace
            <p>
              Five inspections a day.
              <br />
              Every photo stays private.
            </p>
          </div>
          <a href="/devices" className="device-nudge">
            Connect your camera <ArrowUpRight size={16} />
          </a>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="topbar-label">A little clarity for every crop.</span>
          <span className="private-label">Your private workspace</span>
          <UserButton />
        </header>
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>CropDoc</span>
          <span>Photo-based guidance. Local expertise when it matters.</span>
        </footer>
      </div>
    </div>
  );
}
