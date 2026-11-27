"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/button";
import { FormField } from "@/components/form-field";
import { InlineError } from "@/components/inline-error";
import { Input } from "@/components/input";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from "@/shared/auth";
import styles from "./auth.module.css";

export function AuthForm({
  mode,
  art,
}: {
  mode: "login" | "register";
  art?: ReactNode;
}) {
  const router = useRouter();
  const registering = mode === "register";
  const label = registering ? "Create account" : "Sign in";
  const [showPassword, setShowPassword] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (body: LoginInput | RegisterInput) =>
      apiClient<PublicUser>(`/api/auth/${mode}`, { method: "POST", body }),
    onSuccess: () => {
      router.replace("/boards");
      router.refresh();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const parsed = (registering ? registerSchema : loginSchema).safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setIssues(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }
    setIssues({});
    mutation.mutate(parsed.data);
  }

  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const duplicateMessage =
    apiError?.status === 409 ? apiError.message : undefined;
  const credentialsMessage =
    apiError?.status === 401 ? apiError.message : undefined;
  const retryAfter = apiError?.status === 429 ? apiError.retryAfter : null;

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.brand}>
          <span aria-hidden="true">▥</span> Kanban
        </div>
        <h1 id="auth-title">{label}</h1>
        <p className={styles.description}>
          {registering
            ? "Create an account to organize work with your team."
            : "Sign in to get back to your boards."}
        </p>
        <form method="post" className={styles.form} onSubmit={submit}>
          {registering && (
            <FormField id="auth-name" label="Name" error={issues.name}>
              {(props) => (
                <Input
                  {...props}
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              )}
            </FormField>
          )}
          <FormField
            id="auth-email"
            label="Email"
            error={duplicateMessage ?? issues.email}
          >
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                autoComplete={registering ? "email" : "username"}
                required
              />
            )}
          </FormField>
          <FormField
            id="auth-password"
            label="Password"
            error={credentialsMessage ?? issues.password}
          >
            {(props) => (
              <div className={styles.password}>
                <Input
                  {...props}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                />
                <Button
                  variant="ghost"
                  size="small"
                  aria-controls={props.id}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </Button>
              </div>
            )}
          </FormField>
          {mutation.error && !duplicateMessage && !credentialsMessage && (
            <InlineError>
              {apiError?.status === 429
                ? retryAfter === null
                  ? "Too many attempts. Try again shortly."
                  : `Too many attempts. Try again in ${retryAfter} seconds.`
                : mutation.error.message}
            </InlineError>
          )}
          <Button variant="primary" type="submit" loading={mutation.isPending}>
            {label}
          </Button>
        </form>
        <p className={styles.alternate}>
          {registering ? "Already have an account? " : "New to Kanban? "}
          <Link href={registering ? "/login" : "/register"}>
            {registering ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
      {art}
    </main>
  );
}
