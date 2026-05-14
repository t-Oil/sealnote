import { describe, expect, it } from "vitest";

import {
  applyPrfToAuthenticationOptions,
  applyPrfToRegistrationOptions,
  browserSupportsPrfExtension,
} from "@/lib/passkeys/browser";
import { PASSKEY_PRF_LABEL } from "@/lib/passkeys/shared";

describe("passkey prf options", () => {
  it("marks registration options to enable prf on the new credential", () => {
    expect(
      applyPrfToRegistrationOptions({
        challenge: "challenge",
        pubKeyCredParams: [],
        rp: { id: "localhost", name: "SealNote" },
        user: {
          displayName: "User",
          id: "user-id",
          name: "user@example.com",
        },
      }).extensions,
    ).toEqual({
      prf: {},
    });
  });

  it("adds prf evaluation input to authentication options", () => {
    const options = applyPrfToAuthenticationOptions({
      challenge: "challenge",
      rpId: "localhost",
    });

    expect(options.extensions?.prf).toEqual({
      eval: {
        first: new TextEncoder().encode(PASSKEY_PRF_LABEL),
      },
    });
  });

  it("accepts browsers that explicitly report prf support", async () => {
    await expect(
      browserSupportsPrfExtension({
        getClientCapabilities: async () => ({ prf: true }),
        webAuthnAvailable: true,
      }),
    ).resolves.toBe(true);
  });

  it("rejects browsers that explicitly report no prf support", async () => {
    await expect(
      browserSupportsPrfExtension({
        getClientCapabilities: async () => ({ prf: false }),
        webAuthnAvailable: true,
      }),
    ).resolves.toBe(false);
  });

  it("falls back to optimistic support when capability api is unavailable", async () => {
    await expect(browserSupportsPrfExtension({ webAuthnAvailable: true })).resolves.toBe(true);
  });
});
