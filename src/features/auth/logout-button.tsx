"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () => apiClient<void>("/api/auth/logout"),
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
  });

  return (
    <>
      <button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Sign out
      </button>
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
    </>
  );
}
