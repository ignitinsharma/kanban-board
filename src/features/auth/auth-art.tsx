import Image from "next/image";
import styles from "./auth.module.css";

export function AuthArt() {
  const image = Math.floor(Math.random() * 6) + 1;

  return (
    <aside className={styles.art}>
      <Image
        src={`/auth/auth-${image}.webp`}
        alt=""
        fill
        sizes="(min-width: 1024px) 50vw, 0px"
        fetchPriority="high"
        loading="eager"
        unoptimized
      />
      <p>See what’s moving and what’s next.</p>
    </aside>
  );
}
