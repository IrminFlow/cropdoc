import type { Metadata } from "next";
import { CheckCrop } from "@/components/check-crop";
export const metadata: Metadata = { title: "Check your crop" };
export default function Page() {
  return <CheckCrop />;
}
