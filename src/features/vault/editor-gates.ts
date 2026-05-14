export function getProtectedNoteSaveState(input: {
  hasVaultMeta: boolean;
  hasVaultKey: boolean;
  lockMode: "standard" | "sensitive";
}) {
  if (input.lockMode !== "sensitive") {
    return "ready";
  }

  if (!input.hasVaultMeta) {
    return "needs-setup";
  }

  if (!input.hasVaultKey) {
    return "needs-unlock";
  }

  return "ready";
}
