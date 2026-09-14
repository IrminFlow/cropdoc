import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "./globals.css";
// Bricolage Grotesque gives headings a warm, confident voice; Geist keeps
// body text and controls calm and easy to read at large sizes.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const body = Geist({ subsets: ["latin"], variable: "--font-geist" });
export const metadata: Metadata = {
  title: { default: "CropDoc", template: "%s · CropDoc" },
  description:
    "Take a photo of a sick crop. Learn what may be wrong and what to do next.",
  applicationName: "CropDoc",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1510" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "var(--clerk-primary)",
          colorPrimaryForeground: "var(--on-brand)",
          colorForeground: "var(--ink)",
          colorMutedForeground: "var(--ink-2)",
          colorBackground: "var(--surface)",
          colorInput: "var(--surface)",
          colorInputForeground: "var(--ink)",
          colorBorder: "var(--clerk-border)",
          colorNeutral: "var(--ink)",
          fontFamily: "var(--font-body)",
          fontFamilyButtons: "var(--font-body)",
          fontSize: "1.0625rem",
          borderRadius: "14px",
        },
      }}
    >
      <html lang="en" className={`${display.variable} ${body.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
