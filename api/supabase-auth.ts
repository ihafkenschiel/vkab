import type { SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseAuthGateway(supabase: SupabaseClient) {
  return async function authenticate(accessToken: string): Promise<boolean> {
    const { data, error } = await supabase.auth.getUser(accessToken);

    return !error && Boolean(data.user);
  };
}
