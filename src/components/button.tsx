import type { ComponentPropsWithRef } from "react";
import { Spinner } from "./spinner";
import styles from "./button.module.css";

type Props = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "default";
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "default",
  loading,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
