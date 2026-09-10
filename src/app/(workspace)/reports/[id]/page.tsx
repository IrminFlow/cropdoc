import { Report } from "@/components/report";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Report id={(await params).id} />;
}
