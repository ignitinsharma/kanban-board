"use client";

import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Dialog } from "@/components/dialog";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/input";
import { memberAddSchema } from "@/shared/kanban";
import { useBoard } from "./board-hooks";
import { useAddMember, type MutationScope } from "./board-mutations";
import styles from "./board-management.module.css";

export function MembersDialog({
  boardId,
  actorId,
  onClose,
}: MutationScope & { onClose: () => void }) {
  const { data } = useBoard(boardId, { enabled: false });
  const add = useAddMember({ boardId, actorId });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = memberAddSchema.safeParse({ email });
    if (!input.success) {
      setError("Enter a valid email address.");
      return;
    }
    add.mutate(input.data.email, { onSuccess: () => setEmail("") });
  }

  return (
    <Dialog title="Members" onClose={onClose}>
      <ul className={styles.members}>
        {data?.members.map((member) => (
          <li key={member.id} className={styles.member}>
            <Avatar name={member.name} />
            <div className={styles.memberDetails}>
              <strong>{member.name}</strong>
              <span>{member.email}</span>
            </div>
            {member.id === data.ownerId && (
              <span className={styles.owner}>Owner</span>
            )}
          </li>
        ))}
      </ul>
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormField
          id="add-member-email"
          label="Add member by email"
          error={
            error ??
            (add.error?.status === 404
              ? "No user with that email."
              : add.error?.message)
          }
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={email}
              readOnly={add.isPending}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(undefined);
                add.reset();
              }}
            />
          )}
        </FormField>
        <div className={styles.actions}>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" type="submit" loading={add.isPending}>
            Add member
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
