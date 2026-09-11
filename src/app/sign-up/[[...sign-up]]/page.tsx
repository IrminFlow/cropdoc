import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
export default function Page() {
  return (
    <main className="simple-auth">
      <Brand />
      <h1>Create your account</h1>
      <p>Add a photo. Get short care steps.</p>
      <SignUp fallbackRedirectUrl="/upload" />
    </main>
  );
}
