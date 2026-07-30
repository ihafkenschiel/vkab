import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          setupFiles: fileURLToPath(
            new URL("./src/test/setup.ts", import.meta.url),
          ),
          include: ["src/**/*.test.{ts,tsx}", "api/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
        },
      },
    ],
  },
});
