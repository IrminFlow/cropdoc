import { SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
export default function Page() {
  return (
    <main className="simple-auth">
      <Brand />
      <SignIn fallbackRedirectUrl="/upload" />
    </main>
  );
}
