import type { Metadata } from "next";
import { Reports } from "@/components/reports";
export const metadata: Metadata = { title: "My reports" };
export default function Page() {
  return <Reports />;
}
