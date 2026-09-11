import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
export default function Page() {
  return (
    <main className="simple-auth">
      <Brand />
      <SignUp fallbackRedirectUrl="/upload" />
    </main>
  );
}
