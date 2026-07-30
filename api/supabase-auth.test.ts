import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseAuthGateway } from "./supabase-auth";

describe("Supabase server authentication", () => {
  it("validates the bearer token through getUser", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "learner-1" } },
      error: null,
    });
    const supabase = { auth: { getUser } } as unknown as SupabaseClient;
    const authenticate = createSupabaseAuthGateway(supabase);

    await expect(authenticate("learner-token")).resolves.toBe(true);
    expect(getUser).toHaveBeenCalledWith("learner-token");
  });

  it("rejects a token when getUser cannot return a user", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("invalid token"),
    });
    const supabase = { auth: { getUser } } as unknown as SupabaseClient;
    const authenticate = createSupabaseAuthGateway(supabase);

    await expect(authenticate("invalid-token")).resolves.toBe(false);
  });
});
