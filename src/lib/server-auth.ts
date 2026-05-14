import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function requireUserId() {
  const session = await auth();

  if (!session?.user?.id) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session.user.id;
}
