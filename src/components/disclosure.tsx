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
  children: (close: () => void) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  function close() {
    if (details.current) details.current.open = false;
    summary.current?.focus();
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
          close();
        }
      }}
    >
      <summary ref={summary} aria-label={label} className={styles.trigger}>
        {trigger}
      </summary>
      <div className={styles.panel}>{children(close)}</div>
    </details>
  );
}
