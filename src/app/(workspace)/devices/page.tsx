import type { Metadata } from "next";
import { Devices } from "@/components/devices";
export const metadata: Metadata = { title: "Field cameras" };
export default function Page() {
  return <Devices />;
}
