import { describe, expect, it } from "vitest";

import { getProtectedNoteSaveState } from "@/features/vault/editor-gates";

describe("protected note save state", () => {
  it("is ready for standard notes even when the vault is locked", () => {
    expect(
      getProtectedNoteSaveState({
        hasVaultMeta: false,
        hasVaultKey: false,
        lockMode: "standard",
      }),
    ).toBe("ready");
  });

  it("requires setup before saving a protected note without a master password", () => {
    expect(
      getProtectedNoteSaveState({
        hasVaultMeta: false,
        hasVaultKey: false,
        lockMode: "sensitive",
      }),
    ).toBe("needs-setup");
  });

  it("requires unlock before saving a protected note when the vault is locked", () => {
    expect(
      getProtectedNoteSaveState({
        hasVaultMeta: true,
        hasVaultKey: false,
        lockMode: "sensitive",
      }),
    ).toBe("needs-unlock");
  });
});
