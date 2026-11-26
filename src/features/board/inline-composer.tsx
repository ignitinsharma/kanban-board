"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/input";
import { isEmptyComposer, parseComposer } from "./composer-validation";
import styles from "./board-management.module.css";

export function InlineComposer({
  kind,
  initial = "",
  pending,
  error,
  onSubmit,
  onClose,
  resetError,
}: {
  kind: "card" | "column";
  initial?: string;
  pending: boolean;
  error?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  resetError: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<string>();
  const renaming = Boolean(initial);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const result = parseComposer(input.current?.value ?? "", kind);
    if ("error" in result) {
      setValidation(result.error);
      return;
    }
    setValidation(undefined);
    if (result.value === initial) onClose();
    else onSubmit(result.value);
  }

  return (
    <form
      className={styles.composer}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onClose();
        }
      }}
      onBlur={(event) => {
        if (
          !renaming &&
          !pending &&
          !validation &&
          !error &&
          !event.currentTarget.contains(event.relatedTarget) &&
          isEmptyComposer(input.current?.value ?? "")
        )
          onClose();
      }}
    >
      <FormField
        id={id}
        label={kind === "card" ? "Card title" : "Column name"}
        error={validation ?? error}
      >
        {(props) => (
          <Input
            {...props}
            ref={input}
            defaultValue={initial}
            maxLength={kind === "card" ? 200 : 100}
            readOnly={pending}
            onChange={() => {
              setValidation(undefined);
              resetError();
            }}
          />
        )}
      </FormField>
      <div className={styles.actions}>
        <Button disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} variant="primary" type="submit">
          {renaming ? "Save" : kind === "card" ? "Add card" : "Add column"}
        </Button>
      </div>
    </form>
  );
}
