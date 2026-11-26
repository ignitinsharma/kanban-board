"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { Dialog } from "@/components/dialog";
import { FormField } from "@/components/form-field";
import { InlineError } from "@/components/inline-error";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import { Textarea } from "@/components/textarea";
import { cardPrioritySchema } from "@/shared/kanban";
import { cardDiff } from "./card-diff";
import { useBoard } from "./board-hooks";
import {
  useDeleteCard,
  useUpdateCard,
  type MutationScope,
} from "./board-mutations";
import styles from "./board-management.module.css";

export function CardDetailDialog({
  id,
  boardId,
  actorId,
  onClose,
}: MutationScope & { id: string; onClose: () => void }) {
  const { data } = useBoard(boardId, { enabled: false });
  const live = data?.cards.find((card) => card.id === id);
  const [original] = useState(live);
  const [confirming, setConfirming] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const restoreDraftFocus = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateCard({ boardId, actorId });
  const remove = useDeleteCard({ boardId, actorId });
  const pending = update.isPending || remove.isPending;
  const deleted = !live || update.error?.status === 404;
  const members = data?.members ?? [];
  const missingAssignee =
    original?.assigneeId &&
    !members.some(({ id }) => id === original.assigneeId);

  useEffect(() => {
    if (deleted) closeButton.current?.focus();
    else if (confirming) back.current?.focus();
    else if (restoreDraftFocus.current) {
      restoreDraftFocus.current = false;
      saveButton.current?.focus();
    }
  }, [confirming, deleted]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!original || deleted || pending) return;
    const values = new FormData(event.currentTarget);
    const diff = cardDiff(original, {
      title: String(values.get("title") ?? ""),
      description: String(values.get("description") ?? ""),
      priority: String(values.get("priority") ?? ""),
      assigneeId: String(values.get("assigneeId") ?? ""),
    });
    if (!diff.success) {
      setErrors(
        Object.fromEntries(
          diff.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    if (!Object.keys(diff.data).length) onClose();
    else update.mutate({ id, body: diff.data }, { onSuccess: onClose });
  }

  return (
    <Dialog
      title={confirming && !deleted ? "Delete card?" : "Card details"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {deleted || !original ? (
        <div className={styles.form}>
          <InlineError>This card was deleted</InlineError>
          <div className={styles.actions}>
            <Button ref={closeButton} onClick={onClose} disabled={pending}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <>
          <form className={styles.form} onSubmit={save} hidden={confirming}>
            <FormField id="edit-card-title" label="Title" error={errors.title}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  defaultValue={original.title}
                  maxLength={200}
                  required
                  readOnly={pending}
                />
              )}
            </FormField>
            <FormField
              id="edit-card-description"
              label="Description"
              error={errors.description}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  defaultValue={original.description ?? ""}
                  maxLength={5000}
                  readOnly={pending}
                />
              )}
            </FormField>
            <div className={styles.fields}>
              <FormField
                id="edit-card-priority"
                label="Priority"
                error={errors.priority}
              >
                {(props) => (
                  <Select
                    {...props}
                    name="priority"
                    defaultValue={original.priority}
                    disabled={pending}
                  >
                    {cardPrioritySchema.options.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority[0]}
                        {priority.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField
                id="edit-card-assignee"
                label="Assignee"
                error={
                  update.error?.status === 422
                    ? "That assignee is no longer a board member. Choose another member or Unassigned."
                    : errors.assigneeId
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    name="assigneeId"
                    defaultValue={original.assigneeId ?? ""}
                    disabled={pending}
                  >
                    <option value="">Unassigned</option>
                    {missingAssignee && (
                      <option value={original.assigneeId!}>
                        Former member
                      </option>
                    )}
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            </div>
            {update.error && update.error.status !== 422 && (
              <InlineError>{update.error.message}</InlineError>
            )}
            <div className={styles.splitActions}>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
              <div className={styles.actions}>
                <Button disabled={pending} onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={update.isPending}
                  ref={saveButton}
                >
                  Save
                </Button>
              </div>
            </div>
          </form>
          {confirming && (
            <div className={styles.form}>
              <p>
                Delete <strong>{live.title}</strong>?
              </p>
              {remove.error && (
                <InlineError>{remove.error.message}</InlineError>
              )}
              <div className={styles.actions}>
                <Button
                  ref={back}
                  disabled={pending}
                  onClick={() => {
                    restoreDraftFocus.current = true;
                    setConfirming(false);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(id, { onSuccess: onClose })}
                >
                  Delete card
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
