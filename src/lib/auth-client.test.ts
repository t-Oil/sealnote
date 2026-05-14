import { describe, expect, it } from "vitest";

import { isStandaloneMode, shouldUseExternalGoogleAuth } from "@/lib/auth-client";

describe("standalone auth environment", () => {
  it("treats display-mode standalone as an installed app context", () => {
    expect(
      isStandaloneMode({
        matchMedia: () => ({ matches: true }),
      }),
    ).toBe(true);
  });

  it("treats iOS navigator.standalone as an installed app context", () => {
    expect(
      isStandaloneMode({
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });

  it("treats a regular browser tab as non-standalone", () => {
    expect(
      isStandaloneMode({
        matchMedia: () => ({ matches: false }),
        navigatorStandalone: false,
      }),
    ).toBe(false);
  });
});

describe("google auth launch mode", () => {
  it("uses an external browser handoff from standalone mode", () => {
    expect(
      shouldUseExternalGoogleAuth({
        matchMedia: () => ({ matches: true }),
      }),
    ).toBe(true);
  });

  it("keeps oauth in the current tab for normal browser usage", () => {
    expect(
      shouldUseExternalGoogleAuth({
        matchMedia: () => ({ matches: false }),
        navigatorStandalone: false,
      }),
    ).toBe(false);
  });
});
