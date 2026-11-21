import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "@prisma/client";

/** Create (or update the password of) an email/password user the same way Better Auth stores them. */
export async function upsertPasswordUser(db: PrismaClient, opts: { email: string; password: string; name: string; role?: string }) {
  const email = opts.email.toLowerCase();
  const hash = await hashPassword(opts.password);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { role: opts.role ?? existing.role } });
    const acc = await db.account.findFirst({ where: { userId: existing.id, providerId: "credential" } });
    if (acc) await db.account.update({ where: { id: acc.id }, data: { password: hash } });
    else await db.account.create({ data: { id: randomUUID(), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash } });
    return existing;
  }
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email, name: opts.name, role: opts.role ?? "USER", emailVerified: false } });
  await db.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash } });
  return user;
}
