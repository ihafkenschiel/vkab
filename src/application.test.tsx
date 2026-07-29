import { render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { configureApplication } from "./application";

describe("application configuration", () => {
  it("shows safe setup guidance instead of a blank application", () => {
    const Application = configureApplication({});

    render(<Application />);

    expect(
      screen.getByRole("alert", { name: "Configuration needed" }),
    ).toHaveTextContent(
      "Missing required public configuration: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  });

  it("keeps one browser client through Strict Mode and parent rerenders", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const createBrowserClient = vi.fn(() => supabase);
    const Application = configureApplication(
      {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      },
      createBrowserClient,
    );

    const { rerender } = render(
      <StrictMode>
        <Application />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", { name: "Translate" }),
    ).toBeVisible();

    rerender(
      <StrictMode>
        <Application />
      </StrictMode>,
    );

    expect(createBrowserClient).toHaveBeenCalledOnce();
  });

  it("keeps browser-client construction failures inside safe guidance", () => {
    const createBrowserClient = vi.fn(() => {
      throw new Error("sensitive client details");
    });
    const Application = configureApplication(
      {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      },
      createBrowserClient,
    );

    render(<Application />);

    const alert = screen.getByRole("alert", { name: "Configuration needed" });
    expect(alert).toHaveTextContent(
      "Supabase browser configuration could not be initialized. Check .env.local and restart VKab.",
    );
    expect(alert).not.toHaveTextContent("sensitive client details");
  });

  it("renders safe guidance for an unsupported Supabase URL scheme", () => {
    const Application = configureApplication({
      VITE_SUPABASE_URL: "ftp://project.supabase.co/private-value",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
    });

    render(<Application />);

    const alert = screen.getByRole("alert", { name: "Configuration needed" });
    expect(alert).toHaveTextContent(
      "VITE_SUPABASE_URL must use HTTP or HTTPS. Update .env.local and restart VKab.",
    );
    expect(alert).not.toHaveTextContent("private-value");
  });
});
