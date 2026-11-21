import type { Prisma } from "@prisma/client";
import type { Db, Tx } from "./db";

export async function audit(
  db: Db | Tx,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { actorId, action, entityType, entityId, data } });
}

/** Ledger entries are append-only and idempotent by key. */
export async function ledger(
  db: Db | Tx,
  entry: { key: string; kind: string; amount: number; userId?: string | null; refType?: string; refId?: string; memo?: string },
) {
  if (entry.amount === 0) return;
  await db.ledgerEntry.create({
    data: {
      idempotencyKey: entry.key,
      kind: entry.kind,
      amount: entry.amount,
      userId: entry.userId ?? null,
      refType: entry.refType,
      refId: entry.refId,
      memo: entry.memo,
    },
  });
}
