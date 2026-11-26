import styles from "./avatar.module.css";

export function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
  return (
    <span className={styles.avatar} role="img" aria-label={name} title={name}>
      {initials}
    </span>
  );
}
