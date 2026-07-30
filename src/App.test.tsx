import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { TranslationClient } from "./translation-client";

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

  it("retries the external session boundary and becomes ready", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error("network unavailable"),
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: "learner-1" } } },
        error: null,
      });
    const supabase = {
      auth: {
        getSession,
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;

    render(<App supabase={supabase} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Translate" }),
    ).toBeVisible();
    expect(getSession).toHaveBeenCalledTimes(2);
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

describe("phrase translation", () => {
  it("translates a short phrase in the selected language direction", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn().mockResolvedValue({ translatedText: "Dzień dobry" }),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);

    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "  Good morning  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    const result = await screen.findByRole("region", {
      name: "Translation result",
    });
    expect(within(result).getByText("Dzień dobry")).toBeVisible();
    expect(within(result).getByText("Good morning")).toBeVisible();
    expect(within(result).getByText("English to Polish")).toBeVisible();
    expect(translationClient.translate).toHaveBeenCalledWith(
      {
        text: "Good morning",
        sourceLanguage: "en",
        targetLanguage: "pl",
      },
      "learner-token",
    );
  });

  it("rejects an empty phrase before calling the translation service", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn(),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);

    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "   " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a word or phrase to translate.",
    );
    expect(translationClient.translate).not.toHaveBeenCalled();
  });

  it("swaps languages and restores the last direction", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn(),
    } satisfies TranslationClient;
    const values = new Map<string, string>();
    const directionStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const firstRender = render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        directionStorage={directionStorage}
      />,
    );

    expect(
      await screen.findByRole("combobox", { name: "From" }),
    ).toHaveValue("en");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("pl");

    fireEvent.click(screen.getByRole("button", { name: "Swap languages" }));

    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("pl");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("en");
    expect([...values.values()]).toEqual([
      JSON.stringify({
        version: 1,
        sourceLanguage: "pl",
        targetLanguage: "en",
      }),
    ]);

    firstRender.unmount();
    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        directionStorage={directionStorage}
      />,
    );

    expect(
      await screen.findByRole("combobox", { name: "From" }),
    ).toHaveValue("pl");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("en");
  });

  it("announces pending work and prevents duplicate translation requests", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    let finishTranslation!: (value: { translatedText: string }) => void;
    const translationClient = {
      translate: vi.fn().mockReturnValue(
        new Promise<{ translatedText: string }>((resolve) => {
          finishTranslation = resolve;
        }),
      ),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    const submit = screen.getByRole("button", { name: "Translate phrase" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(screen.getByRole("status")).toHaveTextContent("Translating");
    expect(submit).toBeDisabled();
    expect(translationClient.translate).toHaveBeenCalledOnce();

    finishTranslation({ translatedText: "Dzień dobry" });
    expect(await screen.findByText("Dzień dobry")).toBeVisible();
  });

  it("preserves newer form edits while a submitted translation finishes", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    let finishTranslation!: (value: { translatedText: string }) => void;
    const translationClient = {
      translate: vi.fn().mockReturnValue(
        new Promise<{ translatedText: string }>((resolve) => {
          finishTranslation = resolve;
        }),
      ),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    const phrase = await screen.findByRole("textbox", {
      name: "Word or phrase",
    });
    fireEvent.change(phrase, { target: { value: "Good morning" } });
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    fireEvent.change(phrase, { target: { value: "Where is the station?" } });
    fireEvent.click(screen.getByRole("button", { name: "Swap languages" }));
    finishTranslation({ translatedText: "Dzień dobry" });

    const result = await screen.findByRole("region", {
      name: "Translation result",
    });
    expect(phrase).toHaveValue("Where is the station?");
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("pl");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("en");
    expect(within(result).getByText("Good morning")).toBeVisible();
    expect(within(result).getByText("English to Polish")).toBeVisible();
  });

  it("allows a 300-character astral phrase to reach translation", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn().mockResolvedValue({ translatedText: "Uśmiech" }),
    } satisfies TranslationClient;
    const text = "😊".repeat(300);

    render(<App supabase={supabase} translationClient={translationClient} />);
    const phrase = await screen.findByRole("textbox", {
      name: "Word or phrase",
    });
    fireEvent.change(phrase, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(phrase).not.toHaveAttribute("maxlength");
    expect(await screen.findByText("Uśmiech")).toBeVisible();
    expect(translationClient.translate).toHaveBeenCalledWith(
      expect.objectContaining({ text }),
      "learner-token",
    );
  });

  it("rejects a 301-character astral phrase before translation", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn(),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "😊".repeat(301) } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Keep the phrase to 300 characters or fewer.",
    );
    expect(translationClient.translate).not.toHaveBeenCalled();
  });

  it("shows a safe error when translation fails", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "learner-token",
              user: { id: "learner-1" },
            },
          },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi
        .fn()
        .mockRejectedValue(new Error("private-provider-detail")),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Translation is unavailable right now. Try again.",
    );
    expect(alert).not.toHaveTextContent("private-provider-detail");
  });
});
