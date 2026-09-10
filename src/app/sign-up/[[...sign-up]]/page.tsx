import { SignUp } from "@clerk/nextjs";
import { Brand, LeafArt } from "@/components/brand";
export default function Page() {
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div>
          <h1>
            Your crops.
            <br />A clearer picture.
          </h1>
          <p>A little insight can make a difference in the field.</p>
          <LeafArt />
        </div>
        <span>Private photos. Practical guidance.</span>
      </div>
      <div className="auth-form">
        <SignUp />
      </div>
    </div>
  );
}
