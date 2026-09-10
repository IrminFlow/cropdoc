import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Manrope } from "next/font/google";
import "./globals.css";
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
export const metadata: Metadata = {
  title: {
    default: "CropDoc · A closer look at your crops",
    template: "%s · CropDoc",
  },
  description:
    "Turn crop photos into short, practical plant-health reports. Private photos. Clear next steps.",
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
          colorPrimary: "#176443",
          fontFamily: "var(--font-manrope), sans-serif",
          borderRadius: "12px",
        },
      }}
    >
      <html lang="en">
        <body className={manrope.variable}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
