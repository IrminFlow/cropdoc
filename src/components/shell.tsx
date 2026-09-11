"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Camera, Files, Settings } from "lucide-react";
import { Brand } from "./brand";
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="simple-app">
      <header className="simple-header">
        <Brand />
        <div className="simple-account">
          <details className="settings-menu">
            <summary aria-label="More options">
              <Settings size={22} />
              <span>More</span>
            </summary>
            <div>
              <Link href="/upload#how-to">How to use</Link>
              <Link href="/devices">Connect a camera</Link>
            </div>
          </details>
          <UserButton />
        </div>
      </header>
      <nav className="simple-nav" aria-label="Main navigation">
        <Link
          href="/upload"
          aria-current={path === "/upload" ? "page" : undefined}
        >
          <Camera size={22} />
          Check crop
        </Link>
        <Link
          href="/reports"
          aria-current={path.startsWith("/reports") ? "page" : undefined}
        >
          <Files size={22} />
          My reports
        </Link>
      </nav>
      <main className="simple-main">{children}</main>
    </div>
  );
}
