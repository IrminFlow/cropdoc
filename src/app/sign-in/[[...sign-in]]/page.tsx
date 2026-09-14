import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthPage } from "@/components/auth-page";
export const metadata: Metadata = { title: "Sign in" };
export default function Page() {
  return (
    <AuthPage>
      <SignIn fallbackRedirectUrl="/upload" />
    </AuthPage>
  );
}
