import type { ComponentPropsWithRef } from "react";
import styles from "./textarea.module.css";

export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={[styles.control, className].filter(Boolean).join(" ")}
    />
  );
}
