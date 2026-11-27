"use client";

import { Avatar } from "@/components/avatar";
import { Disclosure } from "@/components/disclosure";
import { LogoutButton } from "./logout-button";
import styles from "./auth.module.css";

export function AccountMenu({ name, email }: { name: string; email: string }) {
  return (
    <Disclosure label="Account" trigger={<Avatar name={name} />}>
      {() => (
        <>
          <div className={styles.account}>
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          <LogoutButton />
        </>
      )}
    </Disclosure>
  );
}
