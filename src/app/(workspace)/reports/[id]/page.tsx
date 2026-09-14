import type { Metadata } from "next";
import { Report } from "@/components/report";
export const metadata: Metadata = { title: "Crop report" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Report id={(await params).id} />;
}
