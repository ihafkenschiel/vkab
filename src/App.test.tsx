import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { TranslationClient } from "./translation-client";
import type {
  VocabularyEntry,
  VocabularyRepository,
} from "./vocabulary-repository";

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

  it("explains the limits of anonymous vocabulary access", async () => {
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
      "Clearing browser data or using another device can make this anonymous vocabulary inaccessible.",
    );
  });
});

describe("vocabulary review", () => {
  it("shows the current learner's vocabulary newest first with language directions", async () => {
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
    const vocabularyRepository = {
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([
        {
          id: "new-entry",
          ownerId: "learner-1",
          sourceLanguage: "pl",
          targetLanguage: "en",
          originalText: "Poproszę rachunek",
          translatedText: "The check, please",
          lookupCount: 3,
          createdAt: "2026-07-29T13:00:00.000Z",
          lastLookedUpAt: "2026-07-29T13:00:00.000Z",
        },
        {
          id: "old-entry",
          ownerId: "learner-1",
          sourceLanguage: "en",
          targetLanguage: "pl",
          originalText: "Good morning",
          translatedText: "Dzień dobry",
          lookupCount: 1,
          createdAt: "2026-07-29T12:00:00.000Z",
          lastLookedUpAt: "2026-07-29T12:00:00.000Z",
        },
      ]),
    } satisfies VocabularyRepository;

    render(
      <App
        supabase={supabase}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Vocabulary" }),
    );

    const entries = await screen.findAllByRole("listitem");
    expect(vocabularyRepository.list).toHaveBeenCalledWith("learner-1");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("Poproszę rachunek");
    expect(entries[0]).toHaveTextContent("The check, please");
    expect(entries[0]).toHaveTextContent("Polish to English");
    expect(entries[0]).toHaveTextContent("Looked up 3 times");
    expect(entries[1]).toHaveTextContent("Good morning");
    expect(entries[1]).toHaveTextContent("Dzień dobry");
    expect(entries[1]).toHaveTextContent("English to Polish");
    expect(entries[1]).toHaveTextContent("Looked up once");
  });

  it("offers a direct way to translate when the vocabulary is empty", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const vocabularyRepository = {
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    } satisfies VocabularyRepository;

    render(
      <App
        supabase={supabase}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Vocabulary" }),
    );

    expect(
      await screen.findByRole("heading", { name: "No saved vocabulary yet" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Translate a phrase" }));
    expect(
      screen.getByRole("heading", { name: "Translate" }),
    ).toBeVisible();
  });

  it("announces loading and hides private details when vocabulary loading fails", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "learner-1" } } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    let failLoad!: (reason: Error) => void;
    const vocabularyRepository = {
      save: vi.fn(),
      list: vi.fn().mockReturnValue(
        new Promise((_resolve, reject) => {
          failLoad = reject;
        }),
      ),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Vocabulary" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading vocabulary",
    );
    failLoad(new Error("private table detail"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Vocabulary is unavailable right now. Try again later.",
    );
    expect(alert).not.toHaveTextContent("private table detail");
  });

  it("reloads a translated phrase from the shared repository after remount", async () => {
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
        .mockResolvedValue({ translatedText: "Gdzie jest stacja?" }),
    } satisfies TranslationClient;
    const storedEntries: VocabularyEntry[] = [];
    const vocabularyRepository = {
      save: vi.fn().mockImplementation(async (entry) => {
        const saved: VocabularyEntry = {
          ...entry,
          id: "persisted-entry",
          ownerId: "learner-1",
          lookupCount: 1,
          createdAt: "2026-07-29T12:00:00.000Z",
          lastLookedUpAt: "2026-07-29T12:00:00.000Z",
        };
        storedEntries.push(saved);
        return saved;
      }),
      list: vi.fn().mockImplementation(async (ownerId) =>
        storedEntries.filter((entry) => entry.ownerId === ownerId),
      ),
    } satisfies VocabularyRepository;

    const firstRender = render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Where is the station?" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));
    expect(await screen.findByText("Saved to vocabulary")).toBeVisible();
    firstRender.unmount();

    render(
      <App
        supabase={supabase}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Vocabulary" }),
    );

    expect(await screen.findByText("Gdzie jest stacja?")).toBeVisible();
    expect(vocabularyRepository.save).toHaveBeenCalledOnce();
    expect(vocabularyRepository.list).toHaveBeenCalledWith("learner-1");
  });

  it("refreshes an open vocabulary view when a pending save succeeds", async () => {
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
    const storedEntries: VocabularyEntry[] = [];
    let finishSave!: () => void;
    const vocabularyRepository = {
      save: vi.fn().mockImplementation(
        (entry) =>
          new Promise((resolve) => {
            finishSave = () => {
              const saved = {
                ...entry,
                id: "saved-entry",
                ownerId: "learner-1",
                lookupCount: 1,
                createdAt: "2026-07-29T12:00:00.000Z",
                lastLookedUpAt: "2026-07-29T12:00:00.000Z",
              };
              storedEntries.push(saved);
              resolve(saved);
            };
          }),
      ),
      list: vi.fn().mockImplementation(async (ownerId) =>
        storedEntries.filter((entry) => entry.ownerId === ownerId),
      ),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));
    expect(await screen.findByText("Dzień dobry")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Vocabulary" }));
    expect(
      await screen.findByRole("heading", { name: "No saved vocabulary yet" }),
    ).toBeVisible();

    await act(async () => finishSave());

    expect(await screen.findByText("Dzień dobry")).toBeVisible();
    expect(vocabularyRepository.list).toHaveBeenCalledTimes(2);
  });
});

describe("phrase translation", () => {
  it("uses the current refreshed access token for translation", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "old-token",
            user: { id: "learner-1" },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "refreshed-token",
            user: { id: "learner-1" },
          },
        },
        error: null,
      });
    const supabase = {
      auth: {
        getSession,
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn().mockResolvedValue({ translatedText: "Dzień dobry" }),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(await screen.findByText("Dzień dobry")).toBeVisible();
    expect(translationClient.translate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Good morning" }),
      "refreshed-token",
    );
    expect(translationClient.translate).not.toHaveBeenCalledWith(
      expect.anything(),
      "old-token",
    );
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("stops safely when the current session is no longer available", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "old-token",
            user: { id: "learner-1" },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    const supabase = {
      auth: {
        getSession,
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn(),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your session is unavailable. Reload and try again.",
    );
    expect(translationClient.translate).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("does not expose current-session retrieval failures", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "old-token",
            user: { id: "learner-1" },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error("private current session detail"),
      });
    const supabase = {
      auth: {
        getSession,
        signInAnonymously: vi.fn(),
      },
    } as unknown as SupabaseClient;
    const translationClient = {
      translate: vi.fn(),
    } satisfies TranslationClient;

    render(<App supabase={supabase} translationClient={translationClient} />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Your session is unavailable. Reload and try again.",
    );
    expect(alert).not.toHaveTextContent("private current session detail");
    expect(translationClient.translate).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("automatically saves a successful translation for the current learner", async () => {
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
    const vocabularyRepository = {
      save: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "  Good morning  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(await screen.findByText("Dzień dobry")).toBeVisible();
    expect(vocabularyRepository.save).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "pl",
      originalText: "Good morning",
      translatedText: "Dzień dobry",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved to vocabulary");
  });

  it("shows the translation while a slow vocabulary save is still pending", async () => {
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
    let finishSave!: (value: unknown) => void;
    const vocabularyRepository = {
      save: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          finishSave = resolve;
        }),
      ),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(await screen.findByText("Dzień dobry")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving to vocabulary",
    );
    expect(
      screen.getByRole("button", { name: "Translate phrase" }),
    ).toBeEnabled();

    finishSave({});
    expect(await screen.findByText("Saved to vocabulary")).toBeVisible();
  });

  it("retains the translation and shows a safe message when saving fails", async () => {
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
    const vocabularyRepository = {
      save: vi.fn().mockRejectedValue(new Error("private database detail")),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Word or phrase" }),
      { target: { value: "Good morning" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate phrase" }));

    expect(await screen.findByText("Dzień dobry")).toBeVisible();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Translation shown, but vocabulary could not be saved.",
    );
    expect(alert).not.toHaveTextContent("private database detail");
  });

  it("does not let an older slow save replace the status of a newer lookup", async () => {
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
        .mockResolvedValueOnce({ translatedText: "Dzień dobry" })
        .mockResolvedValueOnce({ translatedText: "Gdzie jest stacja?" }),
    } satisfies TranslationClient;
    let failFirstSave!: (reason: Error) => void;
    const vocabularyRepository = {
      save: vi
        .fn()
        .mockReturnValueOnce(
          new Promise((_resolve, reject) => {
            failFirstSave = reject;
          }),
        )
        .mockResolvedValueOnce({}),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as VocabularyRepository;

    render(
      <App
        supabase={supabase}
        translationClient={translationClient}
        vocabularyRepository={vocabularyRepository}
      />,
    );
    const phrase = await screen.findByRole("textbox", {
      name: "Word or phrase",
    });
    const submit = screen.getByRole("button", { name: "Translate phrase" });
    fireEvent.change(phrase, { target: { value: "Good morning" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Dzień dobry")).toBeVisible();

    fireEvent.change(phrase, { target: { value: "Where is the station?" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Gdzie jest stacja?")).toBeVisible();
    expect(await screen.findByText("Saved to vocabulary")).toBeVisible();

    await act(async () => {
      failFirstSave(new Error("old save failed"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved to vocabulary",
    );
  });

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
    await waitFor(() =>
      expect(translationClient.translate).toHaveBeenCalledOnce(),
    );

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
