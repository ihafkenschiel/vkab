import { z } from "zod";

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const requiredEnvironmentNames = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

export interface PublicEnvironment {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function readPublicEnvironment(
  source: Record<string, unknown>,
): PublicEnvironment {
  const missingNames = requiredEnvironmentNames.filter((name) => {
    const value = source[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingNames.length > 0) {
    throw new Error(
      `Missing required public configuration: ${missingNames.join(", ")}. Add them to .env.local and restart VKab.`,
    );
  }

  const parsedEnvironment = environmentSchema.safeParse(source);

  if (!parsedEnvironment.success) {
    throw new Error(
      "VITE_SUPABASE_URL must be a valid URL. Update .env.local and restart VKab.",
    );
  }

  const environment = parsedEnvironment.data;

  return {
    supabaseUrl: environment.VITE_SUPABASE_URL,
    supabasePublishableKey: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
