"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { InlineError } from "@/components/inline-error";
import { apiClient } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const query = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiClient<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      query.clear();
      router.replace("/login");
      router.refresh();
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Log out
      </Button>
      {mutation.error && <InlineError>{mutation.error.message}</InlineError>}
    </>
  );
}
