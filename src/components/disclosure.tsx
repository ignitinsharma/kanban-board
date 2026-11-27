"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./disclosure.module.css";

export function Disclosure({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: (origin: HTMLElement) => void) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  function close(origin: HTMLElement) {
    const disclosure = origin.closest("details");
    if (disclosure) disclosure.open = false;
    disclosure?.querySelector("summary")?.focus();
  }

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const element = details.current;
      if (element?.open && !event.composedPath().includes(element))
        element.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <details
      ref={details}
      className={styles.disclosure}
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.stopPropagation();
          close(event.currentTarget);
        }
      }}
    >
      <summary aria-label={label} className={styles.trigger}>
        {trigger}
      </summary>
      <div className={styles.panel}>{children(close)}</div>
    </details>
  );
}
