import { fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("anonymous learner session", () => {
  it("shows the ready application shell for an existing session", async () => {
    const signInAnonymously = vi.fn();
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously,
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    expect(
      await screen.findByRole("heading", { name: "Translate" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Vocabulary" }),
    ).toBeEnabled();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates an anonymous session for a first-time visitor", async () => {
    const signInAnonymously = vi.fn().mockResolvedValue({
      data: { session: { user: { id: "new-learner" } } },
      error: null,
    });
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        signInAnonymously,
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    expect(
      await screen.findByRole("heading", { name: "Translate" }),
    ).toBeVisible();
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it("does not create a second identity during repeated startup", async () => {
    const signInAnonymously = vi.fn().mockResolvedValue({
      data: { session: { user: { id: "single-learner" } } },
      error: null,
    });
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        signInAnonymously,
      },
    } as unknown as SupabaseClient;

    render(
      <StrictMode>
        <App supabase={supabase} />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", { name: "Translate" }),
    ).toBeVisible();
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it("announces that the private session is being prepared", () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockReturnValue(new Promise(() => undefined)),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing your private session",
    );
  });

  it("shows an accessible, actionable message when session startup fails", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: new Error("network unavailable"),
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    const alert = await screen.findByRole("alert", {
      name: "Session unavailable",
    });
    expect(alert).toHaveTextContent("Check your connection and try again.");
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeEnabled();
  });

  it("switches between Translate and Vocabulary with focusable controls", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    const vocabularyButton = await screen.findByRole("button", {
      name: "Vocabulary",
    });
    vocabularyButton.focus();
    expect(vocabularyButton).toHaveFocus();

    fireEvent.click(vocabularyButton);

    expect(
      screen.getByRole("heading", { name: "Vocabulary" }),
    ).toBeVisible();
    expect(vocabularyButton).toHaveAttribute("aria-current", "page");
  });

  it("explains the limits of browser-only anonymous vocabulary", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Vocabulary" }),
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "Clearing browser data or using another device can make this vocabulary inaccessible.",
    );
  });
});
