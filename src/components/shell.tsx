"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Camera, ClipboardText, Question } from "@phosphor-icons/react/ssr";
import { Brand } from "./brand";
import styles from "./shell.module.css";

const LINKS = [
  { href: "/upload", label: "Check crop", icon: Camera },
  { href: "/reports", label: "My reports", icon: ClipboardText },
  { href: "/help", label: "Help", icon: Question },
];

function NavLinks({ className }: { className: string }) {
  const path = usePathname();
  return (
    <nav className={className} aria-label="Main">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={26} weight={active ? "fill" : "regular"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.app}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand />
          <NavLinks className={styles.topNav} />
          <div className={styles.account}>
            <UserButton
              appearance={{
                elements: { avatarBox: { width: 44, height: 44 } },
              }}
            />
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <NavLinks className={styles.tabBar} />
    </div>
  );
}
