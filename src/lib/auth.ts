import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { prisma } from "@/lib/db";

function getEnvOrPlaceholder(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "NEXTAUTH_SECRET") {
  const value = process.env[name];

  return value && !value.startsWith("replace-with-") ? value : `missing-${name.toLowerCase()}`;
}

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
  },
  providers: [
    GoogleProvider({
      clientId: getEnvOrPlaceholder("GOOGLE_CLIENT_ID"),
      clientSecret: getEnvOrPlaceholder("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId: account.providerAccountId },
        });
      }
    },
  },
  pages: {
    signIn: "/",
  },
  secret: getEnvOrPlaceholder("NEXTAUTH_SECRET"),
};

export function auth() {
  return getServerSession(authOptions);
}
