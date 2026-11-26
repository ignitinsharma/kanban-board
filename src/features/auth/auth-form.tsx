"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { apiClient } from "@/lib/api-client";
import type { PublicUser } from "@/shared/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const registering = mode === "register";
  const label = registering ? "Create account" : "Sign in";
  const mutation = useMutation({
    mutationFn: (input: Record<string, FormDataEntryValue>) =>
      apiClient<PublicUser>(`/api/auth/${mode}`, input),
    onSuccess: () => {
      router.replace("/");
      router.refresh();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <main>
      <h1>{label}</h1>
      <form onSubmit={submit}>
        {registering && (
          <p>
            <label>
              Name{" "}
              <input name="name" autoComplete="name" maxLength={100} required />
            </label>
          </p>
        )}
        <p>
          <label>
            Email{" "}
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </p>
        <p>
          <label>
            Password{" "}
            <input
              name="password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              required
            />
          </label>
        </p>
        {mutation.error && <p role="alert">{mutation.error.message}</p>}
        <button disabled={mutation.isPending}>{label}</button>
      </form>
      <p>
        <Link href={registering ? "/login" : "/register"}>
          {registering ? "Sign in" : "Create account"}
        </Link>
      </p>
    </main>
  );
}
