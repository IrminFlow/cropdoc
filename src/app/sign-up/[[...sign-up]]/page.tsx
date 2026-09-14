import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthPage } from "@/components/auth-page";
export const metadata: Metadata = { title: "Create account" };
export default function Page() {
  return (
    <AuthPage>
      <SignUp fallbackRedirectUrl="/upload" />
    </AuthPage>
  );
}
