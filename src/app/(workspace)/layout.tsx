import { auth } from "@clerk/nextjs/server";
import { Shell } from "@/components/shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sends signed-out visitors to sign-in. Layouts do not re-run on client
  // navigation, so this is not a data guard: the pages here load everything
  // through API routes that check the caller. A page that reads data on the
  // server must check auth itself.
  await auth.protect();
  return <Shell>{children}</Shell>;
}
