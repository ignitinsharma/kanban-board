import type { ComponentPropsWithRef } from "react";
import styles from "./input.module.css";

export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={[styles.control, styles.multiline, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
