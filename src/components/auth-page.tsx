import Image from "next/image";
import fieldPhoto from "@/assets/photos/field.jpg";
import { Brand } from "./brand";
import styles from "./auth-page.module.css";

/** Frame for Clerk's sign-in and sign-up forms, with a field photo on wide screens. */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.formSide}>
        <header className={styles.header}>
          <Brand />
        </header>
        <main className={styles.main}>{children}</main>
      </div>
      <div className={styles.photoSide} aria-hidden="true">
        <Image
          src={fieldPhoto}
          alt=""
          fill
          placeholder="blur"
          sizes="50vw"
          className={styles.photo}
        />
        <p className={styles.quote}>A closer look at every crop.</p>
      </div>
    </div>
  );
}
