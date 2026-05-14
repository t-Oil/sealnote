import { LockKeyhole } from "lucide-react";

import { SignInCard } from "@/components/auth/sign-in-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { VaultShell } from "@/features/vault/vault-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function Home() {
  const session = await auth();
  const hasVault = session?.user?.id
    ? Boolean(
        await prisma.vaultMeta.findUnique({
          where: { userId: session.user.id },
          select: { userId: true },
        }),
      )
    : false;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
      {session?.user ? (
        <VaultShell
          user={{
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          }}
          hasVault={hasVault}
        />
      ) : (
        <>
          <header className="mb-6 flex items-center justify-between rounded-[28px] px-5 py-4 backdrop-blur-xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                SealNote
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full bg-[color:var(--panel-soft)] px-3 py-2 text-xs text-[color:var(--muted)] sm:inline-flex">
                <LockKeyhole className="size-3.5" />
                Master password stays in browser
              </div>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 items-center justify-center">
            <section className="flex w-full max-w-sm flex-col items-center gap-8 rounded-[32px] border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="space-y-3">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[color:var(--panel-soft)] text-[color:var(--accent)]">
                  <LockKeyhole className="size-6" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--accent)]">
                  Encrypted Vault
                </p>
                <h2 className="font-serif text-4xl tracking-tight text-[color:var(--ink)]">
                  Sign in
                </h2>
              </div>
              <SignInCard />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
