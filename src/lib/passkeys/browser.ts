"use client";

import type {
  AuthenticationResponseJSON,
  AuthenticatorAttachment,
  AuthenticatorTransportFuture,
  PublicKeyCredentialDescriptorJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { PASSKEY_PRF_LABEL } from "@/lib/passkeys/shared";

type PrfOutputs = {
  first: Uint8Array;
};

export function browserSupportsWebAuthn() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

export async function browserSupportsPrfExtension(input?: {
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
  webAuthnAvailable?: boolean;
}) {
  const webAuthnAvailable = input?.webAuthnAvailable ?? browserSupportsWebAuthn();

  if (!webAuthnAvailable) {
    return false;
  }

  if (!input?.getClientCapabilities) {
    return true;
  }

  const capabilities = await input.getClientCapabilities();

  return capabilities.prf === true;
}

export async function platformAuthenticatorIsAvailable() {
  if (!browserSupportsWebAuthn() || !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
    return false;
  }

  return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export async function startPasskeyRegistration(optionsJSON: PublicKeyCredentialCreationOptionsJSON): Promise<{
  credential: RegistrationResponseJSON;
  prfEnabled: boolean;
}> {
  const credential = await navigator.credentials.create({
    publicKey: toCreationOptions(applyPrfToRegistrationOptions(optionsJSON)),
  });

  if (!credential) {
    throw new Error("Passkey registration was cancelled.");
  }

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Unexpected credential response.");
  }

  const response = credential.response;

  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Unexpected attestation response.");
  }

  const prfEnabled =
    (
      credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
        prf?: {
          enabled?: boolean;
        };
      }
    ).prf?.enabled === true;

  return {
    credential: {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      response: {
        clientDataJSON: bufferToBase64URL(response.clientDataJSON),
        attestationObject: bufferToBase64URL(response.attestationObject),
        transports: (typeof response.getTransports === "function"
          ? response.getTransports()
          : undefined) as AuthenticatorTransportFuture[] | undefined,
      },
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment | undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      type: credential.type as "public-key",
    },
    prfEnabled,
  };
}

export async function startPasskeyAuthentication(optionsJSON: PublicKeyCredentialRequestOptionsJSON): Promise<{
  credential: AuthenticationResponseJSON;
  prf: PrfOutputs | null;
}> {
  const credential = await navigator.credentials.get({
    publicKey: toRequestOptions(optionsJSON),
  });

  if (!credential) {
    throw new Error("Biometric unlock was cancelled.");
  }

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Unexpected credential response.");
  }

  const response = credential.response;

  if (!(response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Unexpected assertion response.");
  }

  const clientExtensionResults = credential.getClientExtensionResults();
  const prf = readPrfResult(clientExtensionResults);

  return {
    credential: {
      id: credential.id,
      rawId: bufferToBase64URL(credential.rawId),
      response: {
        authenticatorData: bufferToBase64URL(response.authenticatorData),
        clientDataJSON: bufferToBase64URL(response.clientDataJSON),
        signature: bufferToBase64URL(response.signature),
        userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : undefined,
      },
      authenticatorAttachment: credential.authenticatorAttachment as AuthenticatorAttachment | undefined,
      clientExtensionResults,
      type: credential.type as "public-key",
    },
    prf,
  };
}

export function applyPrfToAuthenticationOptions(optionsJSON: PublicKeyCredentialRequestOptionsJSON) {
  return {
    ...optionsJSON,
    extensions: {
      ...(optionsJSON.extensions ?? {}),
      prf: {
        eval: {
          first: new TextEncoder().encode(PASSKEY_PRF_LABEL),
        },
      },
    },
  };
}

export function applyPrfToRegistrationOptions(optionsJSON: PublicKeyCredentialCreationOptionsJSON) {
  const extensions = optionsJSON.extensions as
    | (AuthenticationExtensionsClientInputs & {
        prf?: Record<string, unknown>;
      })
    | undefined;

  return {
    ...optionsJSON,
    extensions: {
      ...(extensions ?? {}),
      prf: {
        ...(typeof extensions?.prf === "object" && extensions.prf ? extensions.prf : {}),
      },
    },
  };
}

function toCreationOptions(optionsJSON: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...optionsJSON,
    challenge: base64URLToBuffer(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64URLToBuffer(optionsJSON.user.id),
    },
    excludeCredentials: optionsJSON.excludeCredentials?.map((credential: PublicKeyCredentialDescriptorJSON) => ({
      id: base64URLToBuffer(credential.id),
      type: "public-key" as const,
    })),
  };
}

function toRequestOptions(optionsJSON: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  const extensions = optionsJSON.extensions as {
    prf?: {
      eval?: {
        first?: BufferSource;
      };
    };
  } | undefined;

  return {
    ...optionsJSON,
    challenge: base64URLToBuffer(optionsJSON.challenge),
    allowCredentials: optionsJSON.allowCredentials?.map((credential: PublicKeyCredentialDescriptorJSON) => ({
      id: base64URLToBuffer(credential.id),
      type: "public-key" as const,
    })),
    extensions: extensions?.prf
      ? {
          ...extensions,
          prf: {
            eval: {
              first: extensions.prf.eval?.first ?? new TextEncoder().encode(PASSKEY_PRF_LABEL),
            },
          },
        }
      : undefined,
  };
}

function readPrfResult(results: AuthenticationExtensionsClientOutputs) {
  const prfResult = (
    results as AuthenticationExtensionsClientOutputs & {
      prf?: {
        results?: {
          first?: ArrayBuffer;
        };
      };
    }
  ).prf?.results?.first;

  if (!prfResult) {
    return null;
  }

  return {
    first: new Uint8Array(prfResult),
  };
}

function bufferToBase64URL(value: ArrayBufferLike) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64URLToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
