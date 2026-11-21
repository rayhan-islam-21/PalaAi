import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";

export type SessionUser = { id: string; name: string; email: string; role: string };

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Role is read from the database, never trusted from the client.
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  return u;
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "ADMIN") redirect("/dashboard");
  return u;
}
