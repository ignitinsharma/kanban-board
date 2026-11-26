import type { ComponentPropsWithRef } from "react";
import styles from "./input.module.css";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={[styles.control, className].filter(Boolean).join(" ")}
    />
  );
}
