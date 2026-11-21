import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";

export type SessionUser = { id: string; name: string; email: string; role: string; phone: string | null };

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Role is read from the database, never trusted from the client.
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, phone: true, disabled: true },
  });
  if (!u || u.disabled) return null; // disabled / deleted accounts are treated as signed out
  const { disabled: _d, ...rest } = u;
  return rest;
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) redirect("/login?blocked=1"); // signed in, but the account is disabled or deleted
  }
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "ADMIN") redirect("/dashboard");
  return u;
}
