import type { Session, SupabaseClient } from "@supabase/supabase-js";

const learnerSessions = new WeakMap<SupabaseClient, Promise<Session>>();

async function initializeLearnerSession(
  supabase: SupabaseClient,
): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (data.session) {
    return data.session;
  }

  const { data: anonymousData, error: anonymousError } =
    await supabase.auth.signInAnonymously();

  if (anonymousError) {
    throw anonymousError;
  }

  if (!anonymousData.session) {
    throw new Error("Supabase did not return an anonymous learner session.");
  }

  return anonymousData.session;
}

export function obtainLearnerSession(
  supabase: SupabaseClient,
): Promise<Session> {
  const existingRequest = learnerSessions.get(supabase);

  if (existingRequest) {
    return existingRequest;
  }

  const sessionRequest = initializeLearnerSession(supabase);
  learnerSessions.set(supabase, sessionRequest);

  void sessionRequest.catch(() => {
    learnerSessions.delete(supabase);
  });

  return sessionRequest;
}

export async function getCurrentAccessToken(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("The current learner session is unavailable.");
  }

  return data.session.access_token;
}
