import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfiguredApplication } from "./application";

describe("application configuration", () => {
  it("shows safe setup guidance instead of a blank application", () => {
    render(<ConfiguredApplication environment={{}} />);

    expect(
      screen.getByRole("alert", { name: "Configuration needed" }),
    ).toHaveTextContent(
      "Missing required public configuration: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  });
});
