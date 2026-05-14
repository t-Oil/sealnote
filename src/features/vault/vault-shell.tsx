"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Lock,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  ShieldEllipsis,
  Trash2,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { encryptedNoteApiSchema, passkeyListApiSchema, vaultMetaApiSchema } from "@/lib/api-schema";
import { createBiometricBundle, unwrapVaultKeyWithBiometric } from "@/lib/crypto/biometric-vault";
import { decryptNotePayload, encryptNotePayload, type NotePayload, buildNoteAad } from "@/lib/crypto/note";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { setupVault, unlockVault } from "@/lib/crypto/vault";
import {
  applyPrfToAuthenticationOptions,
  browserSupportsWebAuthn,
  browserSupportsPrfExtension,
  platformAuthenticatorIsAvailable,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "@/lib/passkeys/browser";
import { cn } from "@/lib/utils";
import { readBiometricUnlockBundle, removeBiometricUnlockBundle, writeBiometricUnlockBundle } from "@/features/vault/biometric-storage";
import { getProtectedNoteSaveState } from "@/features/vault/editor-gates";
import {
  canDisableBiometricUnlock,
  canShowBiometricUnlockForProtectedNote,
  shouldAutoAttemptBiometricUnlockForProtectedNote,
  shouldShowPasswordFallbackForProtectedNote,
} from "@/features/vault/unlock-gates";
import type {
  BiometricUnlockBundle,
  EncryptedNoteRecord,
  NoteListItem,
  PasskeyListItem,
  PasskeyListResponse,
  UnlockedNote,
  VaultMetaApiRecord,
} from "@/features/vault/types";

type VaultShellProps = {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
  hasVault: boolean;
};

const AUTO_LOCK_MS = 30 * 1000;
const BIOMETRIC_PASSWORD_FALLBACK_THRESHOLD = 3;

const blankPayload = (): NotePayload => ({
  title: "",
  body: "",
  tags: [],
  type: "note",
  fields: {},
});

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getBusyLabel(busy: string | null, lockMode: "standard" | "sensitive") {
  switch (busy) {
    case "boot":
      return "Loading notes...";
    case "setup":
      return "Creating secure vault...";
    case "unlock":
      return "Unlocking protected notes...";
    case "bio-enroll":
      return "Enabling biometric unlock...";
    case "bio-unlock":
      return "Unlocking with biometric...";
    case "bio-disable":
      return "Disabling biometric unlock...";
    case "save":
      return lockMode === "sensitive" ? "Encrypting and saving..." : "Saving note...";
    case "delete":
      return "Deleting note...";
    default:
      return null;
  }
}

export function VaultShell({ user, hasVault }: VaultShellProps) {
  const [vaultMeta, setVaultMeta] = useState<VaultMetaApiRecord | null>(null);
  const [vaultMetaLoaded, setVaultMetaLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  const [unlockMethod, setUnlockMethod] = useState<"biometric" | "password" | null>(null);
  const [noteList, setNoteList] = useState<NoteListItem[]>([]);
  const [unlockedNotes, setUnlockedNotes] = useState<UnlockedNote[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
  const [biometricBundle, setBiometricBundle] = useState<BiometricUnlockBundle | null>(null);
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [supportsBiometricSetup, setSupportsBiometricSetup] = useState(false);
  const [supportsBiometricUnlock, setSupportsBiometricUnlock] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<NotePayload>(blankPayload);
  const [lockMode, setLockMode] = useState<"standard" | "sensitive">("standard");
  const [revealId, setRevealId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [showSaveUnlockAssist, setShowSaveUnlockAssist] = useState(false);
  const [protectedUnlockForcePassword, setProtectedUnlockForcePassword] = useState(false);
  const [protectedUnlockFailures, setProtectedUnlockFailures] = useState(0);
  const [protectedUnlockMessage, setProtectedUnlockMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const displayName = user.name ?? user.email ?? "Signed in";
  const unlockedMap = useMemo(
    () => new Map(unlockedNotes.map((note) => [note.id, note])),
    [unlockedNotes],
  );
  const selectedSummary = selectedId ? noteList.find((note) => note.id === selectedId) ?? null : null;
  const selectedUnlocked = selectedId ? unlockedMap.get(selectedId) ?? null : null;
  const selectedNeedsUnlock = Boolean(
    selectedSummary &&
      selectedSummary.lockMode === "sensitive" &&
      !selectedUnlocked &&
      !vaultKey,
  );
  const hasMatchingBiometricPasskey = Boolean(
    biometricBundle && passkeys.some((passkey) => passkey.credentialId === biometricBundle.credentialId),
  );
  const canUnlockWithBiometric = Boolean(
    !vaultKey && supportsBiometricUnlock && biometricBundle && hasMatchingBiometricPasskey,
  );
  const canUnlockProtectedNoteWithBiometric = canShowBiometricUnlockForProtectedNote({
    hasVaultMeta: Boolean(vaultMeta),
    hasVaultKey: Boolean(vaultKey),
    supportsBiometricUnlock,
    hasBiometricBundle: Boolean(biometricBundle),
    hasMatchingBiometricPasskey,
  });
  const showPasswordFallbackForProtectedNote = shouldShowPasswordFallbackForProtectedNote({
    canUnlockWithBiometric: canUnlockProtectedNoteWithBiometric,
    biometricFailures: protectedUnlockFailures,
    failureThreshold: BIOMETRIC_PASSWORD_FALLBACK_THRESHOLD,
    forcePasswordFallback: protectedUnlockForcePassword,
  });
  const canSetUpBiometric = Boolean(
    vaultMeta &&
      vaultKey &&
      unlockMethod === "password" &&
      supportsBiometricSetup &&
      (!biometricBundle || !hasMatchingBiometricPasskey),
  );
  const canDisableBiometric = canDisableBiometricUnlock({
    hasVaultKey: Boolean(vaultKey),
    hasBiometricBundle: Boolean(biometricBundle),
    hasMatchingBiometricPasskey,
  });
  const protectedNoteSaveState = getProtectedNoteSaveState({
    hasVaultMeta: Boolean(vaultMeta),
    hasVaultKey: Boolean(vaultKey),
    lockMode,
  });
  const busyLabel = getBusyLabel(busy, lockMode);

  const refreshBiometricState = useCallback(async () => {
    const supportsWebAuthn = browserSupportsWebAuthn();
    const [remotePasskeys, localBundle, platformAvailable, prfAvailable] = await Promise.all([
      (async () => {
        try {
          const response = await fetch("/api/passkeys", { cache: "no-store" });

          return passkeyListApiSchema.parse(await readJson<PasskeyListResponse>(response)).passkeys;
        } catch {
          return [];
        }
      })(),
      readBiometricUnlockBundle(user.id),
      supportsWebAuthn ? platformAuthenticatorIsAvailable().catch(() => false) : Promise.resolve(false),
      supportsWebAuthn ? browserSupportsPrfExtension().catch(() => true) : Promise.resolve(false),
    ]);

    let bundle = localBundle;

    if (bundle && bundle.userId !== user.id) {
      await removeBiometricUnlockBundle(user.id);
      bundle = null;
    }

    setPasskeys(remotePasskeys);
    setBiometricBundle(bundle);
    setSupportsBiometricSetup(supportsWebAuthn && platformAvailable && prfAvailable);
    setSupportsBiometricUnlock(supportsWebAuthn && prfAvailable);
    setBiometricChecked(true);
  }, [user.id]);

  useEffect(() => {
    void (async () => {
      setBusy("boot");
      try {
        const [vaultResponse, notesResponse] = await Promise.all([
          fetch("/api/vault/meta", { cache: "no-store" }),
          fetch("/api/notes", { cache: "no-store" }),
        ]);

        if (vaultResponse.status !== 404) {
          const vaultData = await readJson<VaultMetaApiRecord>(vaultResponse);
          setVaultMeta(vaultMetaApiSchema.parse(vaultData));
        }

        const notesData = await readJson<EncryptedNoteRecord[]>(notesResponse);
        const parsed = notesData.map((record) => encryptedNoteApiSchema.parse(record));
        setNoteList(
          parsed.map((note) => ({
            id: note.id,
            title: note.title,
            tags: note.tags,
            bodyPlaintext: note.bodyPlaintext,
            isSensitive: note.isSensitive,
            lockMode: note.lockMode,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          })),
        );
        await refreshBiometricState();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load app state.");
      } finally {
        setVaultMetaLoaded(true);
        setBusy(null);
      }
    })();
  }, [refreshBiometricState]);

  useEffect(() => {
    if (!vaultKey) {
      clearTimers();
      return;
    }

    const lockNow = () => {
      clearTimers();
      setVaultKey(null);
      setUnlockMethod(null);
      setUnlockedNotes([]);
      if (selectedSummary?.lockMode === "sensitive") {
        setIsEditorOpen(false);
      }
    };

    const resetAutoLockNow = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        lockNow();
        setStatus("Vault auto-locked after inactivity.");
      }, AUTO_LOCK_MS);
    };

    resetAutoLockNow();

    const handleActivity = () => resetAutoLockNow();
    const handleHidden = () => {
      if (document.visibilityState === "hidden") {
        lockNow();
      }
    };

    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    document.addEventListener("visibilitychange", handleHidden);

    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      document.removeEventListener("visibilitychange", handleHidden);
      clearTimers();
    };
  }, [vaultKey, selectedSummary]);

  useEffect(() => {
    if (
      !shouldAutoAttemptBiometricUnlockForProtectedNote({
        canUnlockWithBiometric: canUnlockProtectedNoteWithBiometric,
        biometricFailures: protectedUnlockFailures,
        isEditorOpen,
        needsUnlock: selectedNeedsUnlock,
        forcePasswordFallback: protectedUnlockForcePassword,
      }) ||
      busy
    ) {
      return;
    }

    void handleBiometricUnlock({ source: "editor" });
  }, [
    busy,
    canUnlockProtectedNoteWithBiometric,
    isEditorOpen,
    protectedUnlockFailures,
    protectedUnlockForcePassword,
    selectedNeedsUnlock,
  ]);

  function clearTimers() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  async function refreshNoteList() {
    const response = await fetch("/api/notes", { cache: "no-store" });
    const data = await readJson<EncryptedNoteRecord[]>(response);
    const parsed = data.map((record) => encryptedNoteApiSchema.parse(record));

    setNoteList(
      parsed.map((note) => ({
        id: note.id,
        title: note.title,
        tags: note.tags,
        bodyPlaintext: note.bodyPlaintext,
        isSensitive: note.isSensitive,
        lockMode: note.lockMode,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
    );

    return parsed;
  }

  async function loadUnlockedNotes(currentVaultKey: Uint8Array) {
    const parsed = await refreshNoteList();
    const decrypted = await Promise.all(
      parsed.map(async (record) => {
        if (record.lockMode === "standard") {
          return {
            id: record.id,
            title: record.title,
            tags: record.tags,
            bodyPlaintext: record.bodyPlaintext,
            isSensitive: false,
            lockMode: record.lockMode,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            payload: {
              title: record.title,
              body: record.bodyPlaintext ?? "",
              tags: record.tags,
              type: "note",
              fields: {},
            },
          } satisfies UnlockedNote;
        }

        return {
          id: record.id,
          title: record.title,
          tags: record.tags,
          bodyPlaintext: null,
          isSensitive: record.isSensitive,
          lockMode: record.lockMode,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          payload: await decryptNotePayload({
            vaultKey: currentVaultKey,
            ciphertext: base64ToBytes(record.ciphertext ?? ""),
            iv: base64ToBytes(record.iv ?? ""),
            aad: base64ToBytes(record.aad ?? ""),
          }),
        } satisfies UnlockedNote;
      }),
    );

    setUnlockedNotes(decrypted);
    return decrypted;
  }

  async function handleCreateVault(event: React.FormEvent) {
    event.preventDefault();

    if (password.length < 12) {
      setStatus("Use a master password with at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Master password confirmation does not match.");
      return;
    }

    setBusy("setup");
    setStatus(null);

    try {
      const setup = await setupVault({
        password,
        iterations: 600_000,
      });
      const response = await fetch("/api/vault/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup.meta),
      });

      const created = vaultMetaApiSchema.parse(await readJson<VaultMetaApiRecord>(response));
      setVaultMeta(created);
      setVaultKey(setup.vaultKey);
      setUnlockMethod("password");
      setPassword("");
      setConfirmPassword("");
      setIsSetupModalOpen(false);
      setStatus("Master password set. Sensitive notes now available.");
      const decrypted = await loadUnlockedNotes(setup.vaultKey);
      if (selectedId) {
        const selectedNote = decrypted.find((note) => note.id === selectedId);
        if (selectedNote?.lockMode === "sensitive") {
          setForm(selectedNote.payload);
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Vault setup failed.");
    } finally {
      setBusy(null);
    }
  }

  async function persistNote(activeVaultKey?: Uint8Array) {
    const noteId = selectedId ?? crypto.randomUUID();
    const requestBody =
      lockMode === "standard"
        ? {
            id: noteId,
            title: form.title,
            tags: form.tags,
            bodyPlaintext: form.body,
            ciphertext: null,
            iv: null,
            aad: null,
            isSensitive: false,
            lockMode,
          }
        : (() => {
            if (!vaultMeta) {
              setIsSetupModalOpen(true);
              throw new Error("Set a master password before saving protected notes.");
            }

            const currentVaultKey = activeVaultKey ?? vaultKey;

            if (!currentVaultKey) {
              throw new Error("Unlock the vault before saving protected notes.");
            }

            return encryptNotePayload({
              vaultKey: currentVaultKey,
              payload: form,
              aad: buildNoteAad({
                userId: user.id,
                noteId,
                cryptoVersion: vaultMeta.cryptoVersion,
              }),
            }).then((encrypted) => ({
              id: noteId,
              title: form.title,
              tags: form.tags,
              bodyPlaintext: null,
              ciphertext: bytesToBase64(encrypted.ciphertext),
              iv: bytesToBase64(encrypted.iv),
              aad: bytesToBase64(
                buildNoteAad({
                  userId: user.id,
                  noteId,
                  cryptoVersion: vaultMeta.cryptoVersion,
                }),
              ),
              isSensitive: true,
              lockMode,
            }));
          })();

    const body = await requestBody;
    const response = await fetch(selectedId ? `/api/notes/${selectedId}` : "/api/notes", {
      method: selectedId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    await readJson(response);

    if (activeVaultKey ?? vaultKey) {
      await loadUnlockedNotes(activeVaultKey ?? vaultKey!);
    } else {
      await refreshNoteList();
    }

    setSelectedId(noteId);
    setIsEditing(false);
    setIsEditorOpen(false);
    setStatus("Note saved.");
  }

  async function finishUnlock(
    unlockedVaultKey: Uint8Array,
    method: "biometric" | "password",
    options?: { autoSave?: boolean },
  ) {
    setVaultKey(unlockedVaultKey);
    setUnlockMethod(method);
    setPassword("");
    setProtectedUnlockFailures(0);
    setProtectedUnlockForcePassword(false);
    setProtectedUnlockMessage(null);
    const decrypted = await loadUnlockedNotes(unlockedVaultKey);
    if (selectedId) {
      const selectedNote = decrypted.find((note) => note.id === selectedId);
      if (selectedNote?.lockMode === "sensitive") {
        setForm(selectedNote.payload);
      }
    }

    if (options?.autoSave) {
      await persistNote(unlockedVaultKey);
      return;
    }

    setIsMenuOpen(false);
    setStatus(method === "biometric" ? "Vault unlocked with biometric." : "Vault unlocked in memory.");
  }

  async function handleUnlock(event: React.FormEvent, options?: { autoSave?: boolean }) {
    event.preventDefault();

    if (!vaultMeta) {
      setIsSetupModalOpen(true);
      return;
    }

    setBusy("unlock");
    setStatus(null);

    try {
      const unlocked = await unlockVault({
        password,
        meta: vaultMeta,
      });
      await finishUnlock(unlocked.vaultKey, "password", options);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unlock failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableBiometric() {
    if (!vaultKey || !vaultMeta || unlockMethod !== "password") {
      setStatus("Unlock with master password before enabling biometric unlock.");
      return;
    }

    if (!supportsBiometricSetup) {
      setStatus("Biometric unlock is unavailable on this device. Use master password.");
      return;
    }

    let registeredCredentialId: string | null = null;

    setBusy("bio-enroll");
    setStatus(null);

    try {
      const registerOptionsResponse = await fetch("/api/passkeys/register/options", {
        method: "POST",
        cache: "no-store",
      });
      const registerOptions = await readJson<PublicKeyCredentialCreationOptionsJSON>(registerOptionsResponse);
      const registration = await startPasskeyRegistration(registerOptions);

      if (!registration.prfEnabled) {
        throw new Error("This device can create passkeys, but it does not support biometric key derivation (PRF). Use master password.");
      }

      const verifyRegistrationResponse = await fetch("/api/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration.credential),
      });
      const verification = await readJson<{ credentialId: string; ok: boolean }>(verifyRegistrationResponse);
      registeredCredentialId = verification.credentialId;

      const authOptionsResponse = await fetch("/api/passkeys/auth/options", {
        method: "POST",
        cache: "no-store",
      });
      const authOptions = await readJson<PublicKeyCredentialRequestOptionsJSON>(authOptionsResponse);
      const matchingOptions = {
        ...authOptions,
        allowCredentials: authOptions.allowCredentials?.filter(
          (credential: { id: string }) => credential.id === verification.credentialId,
        ),
      };

      if (!matchingOptions.allowCredentials?.length) {
        throw new Error("Registered passkey unavailable for biometric unlock. Use master password.");
      }

      const authentication = await startPasskeyAuthentication(
        applyPrfToAuthenticationOptions(matchingOptions),
      );

      if (!authentication.prf) {
        throw new Error("Biometric PRF unavailable on this device. Use master password.");
      }

      const verifyAuthenticationResponse = await fetch("/api/passkeys/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authentication.credential),
      });
      await readJson<{ ok: boolean }>(verifyAuthenticationResponse);

      const wrappedVault = await createBiometricBundle({
        prfSeed: authentication.prf.first,
        vaultKey,
      });
      const nextBundle: BiometricUnlockBundle = {
        version: 1,
        userId: user.id,
        credentialId: verification.credentialId,
        salt: wrappedVault.salt,
        wrappedVaultKey: wrappedVault.wrappedVaultKey,
        wrappedVaultKeyIv: wrappedVault.wrappedVaultKeyIv,
      };

      await writeBiometricUnlockBundle(nextBundle);
      setBiometricBundle(nextBundle);
      await refreshBiometricState();
      setStatus("Biometric unlock enabled on this device.");
    } catch (error) {
      if (registeredCredentialId) {
        await fetch(`/api/passkeys/${encodeURIComponent(registeredCredentialId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }

      setStatus(
        error instanceof Error
          ? error.message
          : "Biometric unlock unavailable on this device. Use master password.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleBiometricUnlock(options?: { autoSave?: boolean; source?: "editor" | "menu" }) {
    if (!biometricBundle) {
      const message = "Biometric unlock unavailable on this device. Use master password.";
      setProtectedUnlockMessage(message);
      setStatus(message);
      return;
    }

    if (biometricBundle.userId !== user.id) {
      await removeBiometricUnlockBundle(user.id);
      setBiometricBundle(null);
      const message = "Biometric unlock unavailable on this account. Use master password.";
      setProtectedUnlockMessage(message);
      setStatus(message);
      return;
    }

    setBusy("bio-unlock");
    setStatus(null);

    try {
      const authOptionsResponse = await fetch("/api/passkeys/auth/options", {
        method: "POST",
        cache: "no-store",
      });
      const authOptions = await readJson<PublicKeyCredentialRequestOptionsJSON>(authOptionsResponse);
      const matchingOptions = {
        ...authOptions,
        allowCredentials: authOptions.allowCredentials?.filter(
          (credential: { id: string }) => credential.id === biometricBundle.credentialId,
        ),
      };

      if (!matchingOptions.allowCredentials?.length) {
        throw new Error("Biometric unlock unavailable on this device. Use master password.");
      }

      const authentication = await startPasskeyAuthentication(
        applyPrfToAuthenticationOptions(matchingOptions),
      );

      if (!authentication.prf) {
        throw new Error("Biometric unlock unavailable on this device. Use master password.");
      }

      const verifyAuthenticationResponse = await fetch("/api/passkeys/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authentication.credential),
      });
      await readJson<{ ok: boolean }>(verifyAuthenticationResponse);

      const unlockedVaultKey = await unwrapVaultKeyWithBiometric({
        prfSeed: authentication.prf.first,
        salt: biometricBundle.salt,
        wrappedVaultKey: biometricBundle.wrappedVaultKey,
        wrappedVaultKeyIv: biometricBundle.wrappedVaultKeyIv,
      });

      await finishUnlock(unlockedVaultKey, "biometric", options);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Biometric unlock failed. Use master password.";

      if (options?.source === "editor") {
        setProtectedUnlockFailures((current) => {
          const next = current + 1;

          if (next >= BIOMETRIC_PASSWORD_FALLBACK_THRESHOLD) {
            setProtectedUnlockForcePassword(true);
          }

          return next;
        });
        setProtectedUnlockMessage(
          protectedUnlockFailures + 1 >= BIOMETRIC_PASSWORD_FALLBACK_THRESHOLD
            ? "Biometric unlock failed repeatedly. Use master password."
            : "Biometric unlock failed. Try again or use master password.",
        );
      }

      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisableBiometric() {
    if (!biometricBundle) {
      setStatus("Biometric unlock already disabled on this device.");
      return;
    }

    setBusy("bio-disable");
    setStatus(null);

    try {
      await fetch(`/api/passkeys/${encodeURIComponent(biometricBundle.credentialId)}`, {
        method: "DELETE",
      }).then(readJson<{ ok: boolean }>);
      await removeBiometricUnlockBundle(user.id);
      setBiometricBundle(null);
      await refreshBiometricState();
      setStatus("Biometric unlock disabled on this device.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to disable biometric unlock.",
      );
    } finally {
      setBusy(null);
    }
  }

  function lockVault() {
    clearTimers();
    setVaultKey(null);
    setUnlockMethod(null);
    setUnlockedNotes([]);
    setIsMenuOpen(false);
    if (selectedSummary?.lockMode === "sensitive") {
      setIsEditorOpen(false);
    }
  }

  function startNewNote() {
    setSelectedId(null);
    setRevealId(null);
    setForm(blankPayload());
    setLockMode("standard");
    setIsEditing(true);
    setShowSaveUnlockAssist(false);
    setProtectedUnlockFailures(0);
    setProtectedUnlockForcePassword(false);
    setProtectedUnlockMessage(null);
    setIsEditorOpen(true);
  }

  function openNote(note: NoteListItem) {
    const unlocked = unlockedMap.get(note.id) ?? null;

    setSelectedId(note.id);
    setRevealId(null);
    setLockMode(note.lockMode);
    setIsEditing(false);
    setShowSaveUnlockAssist(false);
    setProtectedUnlockFailures(0);
    setProtectedUnlockForcePassword(false);
    setProtectedUnlockMessage(null);

    if (note.lockMode === "standard") {
      setForm({
        title: note.title,
        body: note.bodyPlaintext ?? "",
        tags: note.tags,
        type: "note",
        fields: {},
      });
      setIsEditorOpen(true);
      return;
    }

    if (unlocked) {
      setForm(unlocked.payload);
    } else {
      setForm({
        title: note.title,
        body: "",
        tags: note.tags,
        type: "note",
        fields: {},
      });
    }

    setIsEditorOpen(true);
  }

  async function handleSaveNote(event: React.FormEvent) {
    event.preventDefault();

    if (lockMode === "sensitive" && protectedNoteSaveState === "needs-setup") {
      setShowSaveUnlockAssist(true);
      setIsSetupModalOpen(true);
      return;
    }

    if (lockMode === "sensitive" && protectedNoteSaveState === "needs-unlock") {
      setShowSaveUnlockAssist(true);
      if (canUnlockWithBiometric) {
        void handleBiometricUnlock({ autoSave: true, source: "editor" });
        return;
      }

      setProtectedUnlockForcePassword(true);
      setProtectedUnlockMessage("Unlock first, then SealNote will save this protected note automatically.");
      return;
    }

    setBusy("save");
    setStatus(null);

    try {
      await persistNote();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteNote() {
    if (!selectedId) {
      return;
    }

    setBusy("delete");
    setStatus(null);

    try {
      const response = await fetch(`/api/notes/${selectedId}`, {
        method: "DELETE",
      });

      await readJson(response);

      if (vaultKey) {
        await loadUnlockedNotes(vaultKey);
      } else {
        await refreshNoteList();
      }

      setSelectedId(null);
      setForm(blankPayload());
      setLockMode("standard");
      setIsEditing(false);
      setIsEditorOpen(false);
      setStatus("Note deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  function revealSensitive(noteId: string) {
    setRevealId(noteId);
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }
    revealTimerRef.current = window.setTimeout(() => setRevealId(null), 10_000);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              SealNote
            </p>
            <div className="mt-1 flex items-center gap-3">
              <p className="shrink-0 text-sm text-[color:var(--muted)]">
                {noteList.length} note{noteList.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              disabled={Boolean(busy)}
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>

        {!vaultMetaLoaded ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-[color:var(--muted)]">Checking vault state...</p>
            </CardContent>
          </Card>
        ) : null}

        {status ? (
          <div className="rounded-[24px] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
            {status}
          </div>
        ) : null}

        <Card>
          <CardContent className="space-y-3 p-4 sm:p-6">
            {noteList.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-10 text-center text-sm text-[color:var(--muted)]">
                No notes yet. Tap `+` to create first note.
              </div>
            ) : (
              noteList.map((note) => {
                const unlocked = unlockedMap.get(note.id);
                const preview =
                  note.lockMode === "standard"
                    ? note.bodyPlaintext || "No content"
                    : revealId === note.id && unlocked
                      ? unlocked.payload.body || "No content"
                      : "Protected content";

                return (
                  <button
                    key={note.id}
                    className={cn(
                      "w-full rounded-[24px] border p-4 text-left transition-colors",
                      selectedId === note.id
                        ? "border-[color:var(--accent)] bg-[color:var(--panel-soft)]"
                        : "border-[color:var(--border)] bg-[color:var(--surface-strong)] hover:bg-[color:var(--surface-muted)]",
                    )}
                    type="button"
                    onClick={() => openNote(note)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[color:var(--ink)]">
                          {note.title || "Untitled note"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">
                          {preview}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                          <span>{formatDate(note.updatedAt)}</span>
                          {note.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="rounded-full bg-[color:var(--surface-strong)] px-2 py-1 tracking-normal">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      {note.lockMode === "sensitive" ? (
                        <span
                          className="rounded-full p-2 text-[color:var(--muted)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (unlocked) {
                              revealSensitive(note.id);
                            }
                          }}
                        >
                          {revealId === note.id ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </span>
                      ) : (
                        <ShieldEllipsis className="mt-1 size-4 text-[color:var(--muted)]" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        className="fixed right-5 bottom-5 z-30 shadow-[0_24px_50px_rgba(15,122,255,0.28)]"
        size="icon"
        onClick={startNewNote}
        aria-label="Create new note"
        disabled={Boolean(busy)}
      >
        <Plus className="size-5" />
      </Button>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-[color:var(--overlay)] backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-sm flex-col gap-4 border-l border-[color:var(--border)] bg-[color:var(--surface-strong)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  Menu
                </p>
                <p className="mt-1 text-sm text-[color:var(--muted)]">{displayName}</p>
              </div>
              <Button variant="secondary" size="icon" onClick={() => setIsMenuOpen(false)} aria-label="Close menu" disabled={Boolean(busy)}>
                <X className="size-4" />
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Protected Notes</CardTitle>
                    <CardDescription>
                      {vaultKey
                        ? "Unlocked in memory."
                        : hasVault
                          ? "Unlock to open protected note content."
                          : "Set master password for protected notes."}
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl bg-[color:var(--panel-soft)] p-3 text-[color:var(--accent)]">
                    <ShieldCheck className="size-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {status ? (
                  <div className="rounded-[20px] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[color:var(--muted)]">
                    {status}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={lockVault} disabled={!vaultKey || Boolean(busy)}>
                    <Lock className="size-4" />
                    Lock
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => signOut()} disabled={Boolean(busy)}>
                    <LogOut className="size-4" />
                  </Button>
                </div>

                {vaultMeta && !vaultKey && canUnlockWithBiometric ? (
                  <Button className="w-full" type="button" onClick={() => void handleBiometricUnlock({ source: "menu" })} disabled={Boolean(busy)}>
                    <Fingerprint className="size-4" />
                    {busy === "bio-unlock" ? "Unlocking..." : "Unlock with Biometric"}
                  </Button>
                ) : null}

                {!vaultMeta ? (
                  <Button className="w-full" type="button" onClick={() => setIsSetupModalOpen(true)} disabled={Boolean(busy)}>
                    Set Master Password
                  </Button>
                ) : !vaultKey ? (
                  <form className="space-y-4" onSubmit={handleUnlock}>
                    <div className="space-y-2">
                      <Label htmlFor="unlock-password">Master password</Label>
                      <Input
                        id="unlock-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        disabled={Boolean(busy)}
                      />
                    </div>
                    <Button className="w-full" type="submit" disabled={Boolean(busy)}>
                      {busy === "unlock" ? "Unlocking..." : "Unlock Protected Notes"}
                    </Button>
                  </form>
                ) : null}

                {vaultMeta && vaultKey ? (
                  <div className="space-y-3 rounded-[24px] bg-[color:var(--panel-soft)] p-4 text-sm text-[color:var(--muted)]">
                    <p>
                      {unlockMethod === "password"
                        ? "Unlocked with master password."
                        : "Unlocked with biometric. Master password stays fallback."}
                    </p>

                    {canSetUpBiometric ? (
                      <Button className="w-full" type="button" onClick={handleEnableBiometric} disabled={Boolean(busy) || !biometricChecked}>
                        <Fingerprint className="size-4" />
                        {busy === "bio-enroll" ? "Enabling..." : "Enable Biometric Unlock"}
                      </Button>
                    ) : null}

                    {canDisableBiometric ? (
                      <Button variant="secondary" className="w-full" type="button" onClick={handleDisableBiometric} disabled={Boolean(busy)}>
                        Disable Biometric Unlock
                      </Button>
                    ) : null}

                    {!canSetUpBiometric && !canDisableBiometric && biometricChecked && supportsBiometricSetup && !hasMatchingBiometricPasskey ? (
                      <p>Lock, then unlock with master password to set up biometric unlock on this device.</p>
                    ) : null}

                    {!supportsBiometricSetup && biometricChecked ? (
                      <p>Biometric unlock unavailable on this device. Master password remains required.</p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {isEditorOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-[color:var(--overlay)] backdrop-blur-sm"
          onClick={() => {
            if (selectedId && !isEditing && !busy) {
              setIsEditorOpen(false);
            }
          }}
        >
          <div
            className="max-h-[92vh] w-full overflow-auto rounded-t-[32px] border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-4 shadow-[0_-20px_60px_rgba(15,23,42,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[color:var(--handle)]" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  Editor
                </p>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  {selectedId ? (isEditing ? "Edit note" : "Preview note") : "New note"}
                </p>
              </div>
              <Button variant="secondary" size="icon" onClick={() => setIsEditorOpen(false)} aria-label="Close editor" disabled={Boolean(busy)}>
                <X className="size-4" />
              </Button>
            </div>

            {selectedNeedsUnlock ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">{selectedSummary?.title || "Protected note"}</CardTitle>
                  <CardDescription>
                    Unlock first to read protected content.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedSummary?.tags.length ? (
                    <div className="flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                      {selectedSummary.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[color:var(--panel-soft)] px-3 py-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {canUnlockProtectedNoteWithBiometric && !showPasswordFallbackForProtectedNote ? (
                    <div className="space-y-4 rounded-[24px] bg-[color:var(--panel-soft)] p-4 text-sm text-[color:var(--muted)]">
                      <div className="space-y-1">
                        <p className="font-medium text-[color:var(--ink)]">
                          {busy === "bio-unlock" ? "Unlocking with biometric..." : "Biometric unlock ready."}
                        </p>
                        <p>
                          {protectedUnlockMessage ??
                            "Use Touch ID / Windows Hello first. Password stays available if needed."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          className="w-full sm:flex-1"
                          type="button"
                          onClick={() => void handleBiometricUnlock({ autoSave: true, source: "editor" })}
                          disabled={Boolean(busy)}
                        >
                          <Fingerprint className="size-4" />
                          {busy === "bio-unlock" ? "Unlocking..." : "Unlock And Save With Biometric"}
                        </Button>
                        <Button
                          variant="secondary"
                          className="w-full sm:flex-1"
                          type="button"
                          onClick={() => setProtectedUnlockForcePassword(true)}
                          disabled={Boolean(busy)}
                        >
                          Use Password
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {vaultMeta && showPasswordFallbackForProtectedNote ? (
                    <form className="space-y-4" onSubmit={handleUnlock}>
                      {protectedUnlockMessage ? (
                        <p className="text-sm text-[color:var(--muted)]">{protectedUnlockMessage}</p>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="editor-unlock-password">Master password</Label>
                        <Input
                          id="editor-unlock-password"
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        required
                        disabled={Boolean(busy)}
                      />
                      </div>
                      <Button className="w-full" type="submit" disabled={Boolean(busy)}>
                        {busy === "unlock" ? "Unlocking..." : "Unlock With Password"}
                      </Button>
                    </form>
                  ) : !vaultMeta ? (
                    <Button className="w-full" type="button" onClick={() => setIsSetupModalOpen(true)} disabled={Boolean(busy)}>
                      Set Master Password
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : !selectedId || isEditing ? (
              <form className="space-y-5" onSubmit={handleSaveNote}>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Quick thought, secure memo, account note"
                  disabled={Boolean(busy)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={form.tags.join(", ")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="work, personal"
                  disabled={Boolean(busy)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Description</Label>
                  <Textarea
                    id="body"
                    value={form.body}
                    onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                    placeholder={
                      lockMode === "sensitive"
                        ? "Protected content. Unlock required for viewing on other devices/sessions."
                        : "Normal note. Viewable immediately without unlock."
                    }
                    className="min-h-[280px]"
                    disabled={Boolean(busy)}
                  />
                </div>
                <label className="flex items-center gap-3 rounded-[24px] bg-[color:var(--panel-soft)] p-4 text-sm text-[color:var(--muted)]">
                  <input
                    type="checkbox"
                    checked={lockMode === "sensitive"}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setLockMode(checked ? "sensitive" : "standard");
                      if (checked && !vaultMeta) {
                        setIsSetupModalOpen(true);
                      }
                    }}
                    disabled={Boolean(busy)}
                  />
                  Protect this note with master password
                </label>
                {lockMode === "sensitive" && protectedNoteSaveState !== "ready" && showSaveUnlockAssist ? (
                  <div className="space-y-3 rounded-[24px] bg-[color:var(--panel-soft)] p-4 text-sm text-[color:var(--muted)]">
                    <p className="font-medium text-[color:var(--ink)]">
                      {protectedNoteSaveState === "needs-setup"
                        ? "Set a master password before saving this protected note."
                        : "Unlock the vault before encrypting and saving this protected note."}
                    </p>
                    {protectedNoteSaveState === "needs-setup" ? (
                      <Button
                        type="button"
                        className="w-full"
                        onClick={() => setIsSetupModalOpen(true)}
                        disabled={Boolean(busy)}
                      >
                        Set Master Password
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        {canUnlockWithBiometric ? (
                          <Button
                            type="button"
                            className="w-full"
                            onClick={() => void handleBiometricUnlock({ autoSave: true, source: "editor" })}
                            disabled={Boolean(busy)}
                          >
                            <Fingerprint className="size-4" />
                            {busy === "bio-unlock" ? "Unlocking..." : "Unlock And Save With Biometric"}
                          </Button>
                        ) : null}
                        <form className="space-y-3" onSubmit={(event) => void handleUnlock(event, { autoSave: true })}>
                          <div className="space-y-2">
                            <Label htmlFor="editor-save-unlock-password">Master password</Label>
                            <Input
                              id="editor-save-unlock-password"
                              type="password"
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              required
                              disabled={Boolean(busy)}
                            />
                          </div>
                          <Button type="submit" variant="secondary" className="w-full" disabled={Boolean(busy)}>
                            {busy === "unlock" ? "Unlocking..." : "Unlock And Save With Password"}
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={selectedId ? () => setIsEditing(false) : startNewNote}
                    disabled={Boolean(busy)}
                  >
                    <FileText className="size-4" />
                    {selectedId ? "Cancel" : "Clear"}
                  </Button>
                  {selectedId ? (
                    <Button type="button" variant="danger" onClick={handleDeleteNote} disabled={Boolean(busy)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={Boolean(busy)}
                  >
                    {busy === "save"
                      ? "Saving..."
                      : "Save"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                    {lockMode === "sensitive" ? "Protected note" : "Normal note"}
                  </p>
                  <h2 className="font-serif text-3xl tracking-tight text-[color:var(--ink)]">
                    {form.title || "Untitled note"}
                  </h2>
                  {form.tags.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {form.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[color:var(--panel-soft)] px-3 py-1 text-xs text-[color:var(--muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
                    {form.body || "No content"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="flex-1" onClick={() => setIsEditing(true)} disabled={Boolean(busy)}>
                    Edit
                  </Button>
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsEditorOpen(false)} disabled={Boolean(busy)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isSetupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay)] p-4 backdrop-blur-sm sm:items-center">
          <Card role="dialog" aria-modal="true" aria-labelledby="create-vault-title" className="w-full max-w-md">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                Protected notes
              </p>
              <CardTitle id="create-vault-title">Set master password</CardTitle>
              <CardDescription>
                Needed only for notes you want to protect. Normal notes stay viewable without unlock.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateVault}>
                <div className="space-y-2">
                  <Label htmlFor="master-password">Master password</Label>
                  <Input
                    id="master-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                  required
                  disabled={Boolean(busy)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={12}
                  required
                  disabled={Boolean(busy)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" type="button" onClick={() => setIsSetupModalOpen(false)} disabled={Boolean(busy)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" type="submit" disabled={Boolean(busy)}>
                    {busy === "setup" ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {busyLabel ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--overlay)] backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-5 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
            <div className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--accent)]" />
            <p className="text-sm font-medium text-[color:var(--ink)]">{busyLabel}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
