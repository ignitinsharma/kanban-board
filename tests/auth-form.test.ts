import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AuthForm } from "../src/features/auth/auth-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

it.each(["login", "register"] as const)(
  "renders the %s form with POST before hydration",
  (mode) => {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(AuthForm, { mode }),
      ),
    );
    expect(html).toMatch(/<form\b[^>]*\bmethod="post"/i);
  },
);
