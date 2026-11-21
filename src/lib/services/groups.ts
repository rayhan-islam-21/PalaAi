import { randomInt } from "node:crypto";
import type { Db, Tx } from "../db";
import { isUniqueViolation } from "../db";
import { AppError } from "../errors";
import { getSettings } from "../settings";
import { groupQuote } from "../pricing";
import { audit, ledger } from "../audit";
import { currentOrNextWindow, isWithinSlot, type Slot } from "../slots";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Serialize concurrent changes to one cycle (payments, leaves, cancels, activation). */
async function lockCycle(tx: Tx, cycleId: string) {
  await tx.$queryRaw`SELECT id FROM "GroupCycle" WHERE id = ${cycleId} FOR UPDATE`;
}

export async function createGroup(
  db: Db,
  input: { userId: string; name: string; seats: number; slotIndex: number; now: Date },
) {
  const name = input.name.trim().slice(0, 60) || "আমাদের গ্রুপ";
  if (input.seats !== 4 && input.seats !== 5) throw new AppError("BAD_SEATS", "৪ অথবা ৫ জনের গ্রুপ বেছে নিন।");
  const settings = await getSettings(db);
  const schedule = input.seats === 4 ? settings.schedule4 : settings.schedule5;
  if (input.slotIndex < 0 || input.slotIndex >= schedule.length) throw new AppError("BAD_SLOT", "সঠিক সময় বেছে নিন।");
  const q = groupQuote(settings.poolAmount, input.seats, settings.serviceFeePerMember);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const group = await tx.group.create({
          data: {
            name,
            ownerId: input.userId,
            seatCount: input.seats,
            inviteCode: newInviteCode(),
            schedule,
          },
        });
        const m = await tx.membership.create({
          data: { groupId: group.id, userId: input.userId, slotIndex: input.slotIndex },
        });
        const cycle = await tx.groupCycle.create({
          data: {
            groupId: group.id,
            cycleNumber: 1,
            poolAmount: q.poolAmount,
            sharePerMember: q.sharePerMember,
            feePerMember: q.feePerMember,
            pricePerMember: q.pricePerMember,
          },
        });
        await tx.cycleShare.create({
          data: {
            cycleId: cycle.id,
            membershipId: m.id,
            userId: input.userId,
            amountDue: q.pricePerMember,
            allowance: q.sharePerMember,
            remaining: q.sharePerMember,
          },
        });
        await audit(tx, input.userId, "group.create", "Group", group.id, { seats: input.seats, quote: q });
        return group;
      });
    } catch (e) {
      if (isUniqueViolation(e)) continue; // invite code collision; retry
      throw e;
    }
  }
  throw new AppError("RETRY", "আবার চেষ্টা করুন।");
}

export async function findGroupByCode(db: Db, code: string) {
  return db.group.findUnique({ where: { inviteCode: normalizeCode(code) } });
}

/** The cycle currently open for payment (PENDING) or running (ACTIVE). */
export async function openCycle(db: Db | Tx, groupId: string) {
  return db.groupCycle.findFirst({
    where: { groupId, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { cycleNumber: "desc" },
  });
}

export async function joinGroup(db: Db, input: { userId: string; code: string; slotIndex: number; now: Date }) {
  const group = await findGroupByCode(db, input.code);
  if (!group) throw new AppError("NOT_FOUND", "এই কোডে কোনো গ্রুপ পাওয়া যায়নি।", 404);
  if (group.status === "CANCELLED") throw new AppError("CANCELLED", "এই গ্রুপটি বাতিল হয়ে গেছে।");
  const cycle = await openCycle(db, group.id);
  if (!cycle || cycle.status !== "PENDING") throw new AppError("NOT_OPEN", "এই গ্রুপে এখন নতুন সদস্য নেওয়া হচ্ছে না।");
  const schedule = group.schedule as Slot[];
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex >= schedule.length) {
    throw new AppError("BAD_SLOT", "সঠিক সময় বেছে নিন।");
  }
  try {
    return await db.$transaction(async (tx) => {
      await lockCycle(tx, cycle.id);
      const fresh = await tx.groupCycle.findUnique({ where: { id: cycle.id } });
      if (fresh?.status !== "PENDING") throw new AppError("NOT_OPEN", "এই গ্রুপে এখন নতুন সদস্য নেওয়া হচ্ছে না।");
      const m = await tx.membership.create({
        data: { groupId: group.id, userId: input.userId, slotIndex: input.slotIndex },
      });
      await tx.cycleShare.create({
        data: {
          cycleId: cycle.id,
          membershipId: m.id,
          userId: input.userId,
          amountDue: cycle.pricePerMember,
          allowance: cycle.sharePerMember,
          remaining: cycle.sharePerMember,
        },
      });
      await audit(tx, input.userId, "group.join", "Group", group.id, { slotIndex: input.slotIndex });
      return { group, membership: m };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const already = await db.membership.findFirst({
        where: { groupId: group.id, userId: input.userId, status: "ACTIVE" },
      });
      if (already) throw new AppError("ALREADY_MEMBER", "আপনি ইতিমধ্যে এই গ্রুপের সদস্য।", 409);
      throw new AppError("SLOT_TAKEN", "দুঃখিত, এই সময়টি এইমাত্র অন্য কেউ নিয়ে নিয়েছে। অন্য একটি সময় বেছে নিন।", 409);
    }
    throw e;
  }
}

export async function leaveGroup(db: Db, input: { userId: string; groupId: string; now: Date }) {
  const group = await db.group.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError("NOT_FOUND", "গ্রুপ পাওয়া যায়নি।", 404);
  if (group.ownerId === input.userId) {
    throw new AppError("OWNER", "গ্রুপ তৈরিকারী গ্রুপ ছাড়তে পারবেন না — চাইলে গ্রুপটি বাতিল করতে পারেন।");
  }
  const m = await db.membership.findFirst({ where: { groupId: group.id, userId: input.userId, status: "ACTIVE" } });
  if (!m) throw new AppError("NOT_MEMBER", "আপনি এই গ্রুপের সদস্য নন।", 404);
  const cycle = await openCycle(db, group.id);
  if (!cycle || cycle.status !== "PENDING") {
    throw new AppError("CYCLE_RUNNING", "চলতি মাস চালু থাকা অবস্থায় গ্রুপ ছাড়া যাবে না। মেয়াদ শেষে রিনিউ না করলেই হবে।");
  }
  await db.$transaction(async (tx) => {
    await lockCycle(tx, cycle.id);
    const share = await tx.cycleShare.findUnique({ where: { cycleId_membershipId: { cycleId: cycle.id, membershipId: m.id } } });
    if (share) {
      const pending = await tx.paymentClaim.count({ where: { shareId: share.id, status: "PENDING" } });
      if (pending > 0) throw new AppError("PAYMENT_PENDING", "আপনার পেমেন্ট যাচাই চলছে, এখন গ্রুপ ছাড়া যাবে না।");
      const voided = await tx.cycleShare.updateMany({ where: { id: share.id, status: "UNPAID" }, data: { status: "VOID" } });
      if (voided.count === 0) {
        throw new AppError("ALREADY_PAID", "আপনি ইতিমধ্যে টাকা দিয়েছেন। গ্রুপ ছাড়তে চাইলে সাপোর্টে যোগাযোগ করুন অথবা গ্রুপ তৈরিকারীকে বাতিল করতে বলুন।");
      }
    }
    await tx.membership.update({ where: { id: m.id }, data: { status: "LEFT", leftAt: input.now } });
    await audit(tx, input.userId, "group.leave", "Group", group.id, { slotIndex: m.slotIndex });
  });
}

/**
 * Cancel a group whose cycle is still waiting for payments. Paid shares become
 * refunds owed, which admin settles through the refund workflow.
 */
export async function cancelGroup(
  db: Db,
  input: { actorId: string; isAdmin: boolean; groupId: string; reason: string; now: Date },
) {
  const group = await db.group.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError("NOT_FOUND", "গ্রুপ পাওয়া যায়নি।", 404);
  if (!input.isAdmin && group.ownerId !== input.actorId) throw new AppError("FORBIDDEN", "শুধু গ্রুপ তৈরিকারী বাতিল করতে পারবেন।", 403);
  const cycle = await openCycle(db, group.id);
  if (cycle?.status === "ACTIVE") throw new AppError("CYCLE_RUNNING", "চালু থাকা গ্রুপ বাতিল করা যাবে না।");

  return db.$transaction(async (tx) => {
    if (cycle) await lockCycle(tx, cycle.id);
    const g = await tx.group.updateMany({
      where: { id: group.id, status: { in: ["FORMING", "EXPIRED"] } },
      data: { status: "CANCELLED", cancelledAt: input.now, cancelReason: input.reason.slice(0, 300) },
    });
    if (g.count === 0) throw new AppError("NOT_CANCELLABLE", "এই গ্রুপটি বাতিল করা যাচ্ছে না।");
    const refunds: string[] = [];
    if (cycle) {
      await tx.groupCycle.update({ where: { id: cycle.id }, data: { status: "CANCELLED" } });
      const shares = await tx.cycleShare.findMany({ where: { cycleId: cycle.id } });
      for (const s of shares) {
        if (s.status === "PAID") {
          await tx.cycleShare.update({ where: { id: s.id }, data: { status: "REFUND_DUE" } });
          const r = await tx.refund.create({
            data: { userId: s.userId, shareId: s.id, amount: s.amountDue, reason: "গ্রুপ বাতিল হয়েছে" },
          });
          await ledger(tx, { key: `refund-due:${r.id}`, kind: "REFUND_DUE", amount: r.amount, userId: s.userId, refType: "Refund", refId: r.id });
          refunds.push(r.id);
        } else if (s.status === "UNPAID") {
          await tx.cycleShare.update({ where: { id: s.id }, data: { status: "VOID" } });
        }
      }
    }
    await audit(tx, input.actorId, "group.cancel", "Group", group.id, { reason: input.reason, refunds, byAdmin: input.isAdmin });
    return { refunds };
  });
}

/** Activate the cycle if every seat is filled and every active member has paid. Call inside a tx holding the cycle lock. */
export async function maybeActivate(tx: Tx, cycleId: string, now: Date) {
  await lockCycle(tx, cycleId);
  const cycle = await tx.groupCycle.findUnique({ where: { id: cycleId }, include: { group: true } });
  if (!cycle || cycle.status !== "PENDING" || cycle.group.status === "CANCELLED") return false;
  const members = await tx.membership.findMany({ where: { groupId: cycle.groupId, status: "ACTIVE" } });
  if (members.length !== cycle.group.seatCount) return false;
  const shares = await tx.cycleShare.findMany({ where: { cycleId, membershipId: { in: members.map((m) => m.id) } } });
  if (shares.length !== members.length || shares.some((s) => s.status !== "PAID")) return false;

  const settings = await getSettings(tx);
  const endsAt = new Date(now.getTime() + settings.cycleDays * 24 * 60 * 60 * 1000);
  const upd = await tx.groupCycle.updateMany({
    where: { id: cycleId, status: "PENDING" },
    data: { status: "ACTIVE", startsAt: now, endsAt },
  });
  if (upd.count === 0) return false;
  await tx.group.update({ where: { id: cycle.groupId }, data: { status: "ACTIVE" } });
  for (const s of shares) {
    // Service fee is earned once the cycle actually starts.
    await ledger(tx, { key: `fee:${s.id}`, kind: "SERVICE_FEE", amount: cycle.feePerMember, userId: s.userId, refType: "CycleShare", refId: s.id });
  }
  await audit(tx, null, "cycle.activate", "GroupCycle", cycleId, { startsAt: now.toISOString(), endsAt: endsAt.toISOString() });
  return true;
}

/** Lazily close cycles whose 30 days have passed. */
export async function expireCycles(db: Db, now: Date, groupId?: string) {
  const due = await db.groupCycle.findMany({
    where: { status: "ACTIVE", endsAt: { lte: now }, ...(groupId ? { groupId } : {}) },
    select: { id: true, groupId: true },
  });
  for (const c of due) {
    await db.$transaction(async (tx) => {
      await lockCycle(tx, c.id);
      const upd = await tx.groupCycle.updateMany({ where: { id: c.id, status: "ACTIVE" }, data: { status: "ENDED" } });
      if (upd.count === 0) return;
      await tx.group.updateMany({ where: { id: c.groupId, status: "ACTIVE" }, data: { status: "EXPIRED" } });
      const shares = await tx.cycleShare.findMany({ where: { cycleId: c.id, status: "PAID" } });
      const unused = shares.reduce((a, s) => a + s.remaining, 0);
      await ledger(tx, { key: `expired-allowance:${c.id}`, kind: "EXPIRED_ALLOWANCE", amount: unused, refType: "GroupCycle", refId: c.id });
      await audit(tx, null, "cycle.expire", "GroupCycle", c.id, { unusedAllowance: unused });
    });
  }
}

/** Start the next cycle for an expired group, at today's admin pricing (locked for that cycle). */
export async function renewGroup(db: Db, input: { userId: string; groupId: string; now: Date }) {
  await expireCycles(db, input.now, input.groupId);
  const group = await db.group.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError("NOT_FOUND", "গ্রুপ পাওয়া যায়নি।", 404);
  const me = await db.membership.findFirst({ where: { groupId: group.id, userId: input.userId, status: "ACTIVE" } });
  if (!me) throw new AppError("FORBIDDEN", "আপনি এই গ্রুপের সদস্য নন।", 403);
  if (group.status !== "EXPIRED") throw new AppError("NOT_EXPIRED", "গ্রুপের মেয়াদ এখনো শেষ হয়নি।");
  const settings = await getSettings(db);
  const q = groupQuote(settings.poolAmount, group.seatCount, settings.serviceFeePerMember);
  const last = await db.groupCycle.findFirst({ where: { groupId: group.id }, orderBy: { cycleNumber: "desc" } });
  try {
    return await db.$transaction(async (tx) => {
      const cycle = await tx.groupCycle.create({
        data: {
          groupId: group.id,
          cycleNumber: (last?.cycleNumber ?? 0) + 1,
          poolAmount: q.poolAmount,
          sharePerMember: q.sharePerMember,
          feePerMember: q.feePerMember,
          pricePerMember: q.pricePerMember,
        },
      });
      const members = await tx.membership.findMany({ where: { groupId: group.id, status: "ACTIVE" } });
      for (const m of members) {
        await tx.cycleShare.create({
          data: {
            cycleId: cycle.id,
            membershipId: m.id,
            userId: m.userId,
            amountDue: q.pricePerMember,
            allowance: q.sharePerMember,
            remaining: q.sharePerMember,
          },
        });
      }
      await tx.group.update({ where: { id: group.id }, data: { status: "FORMING" } });
      await audit(tx, input.userId, "group.renew", "Group", group.id, { cycleNumber: cycle.cycleNumber, quote: q });
      return cycle;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("ALREADY_RENEWING", "রিনিউ ইতিমধ্যে শুরু হয়েছে।", 409);
    throw e;
  }
}

export type MemberSlotInfo = {
  groupId: string;
  groupName: string;
  shareId: string;
  slot: Slot;
  window: { start: Date; end: Date; active: boolean } | null;
  remaining: number;
  allowance: number;
  cycleEndsAt: Date;
};

/** Active group allowances for a user, with their current/next slot window (within the cycle). */
export async function activeAllowances(db: Db, userId: string, now: Date): Promise<MemberSlotInfo[]> {
  await expireCycles(db, now);
  const shares = await db.cycleShare.findMany({
    where: {
      userId,
      status: "PAID",
      cycle: { status: "ACTIVE", endsAt: { gt: now } },
      membership: { status: "ACTIVE" },
    },
    include: { cycle: { include: { group: true } }, membership: true },
  });
  return shares.map((s) => {
    const schedule = s.cycle.group.schedule as Slot[];
    const slot = schedule[s.membership.slotIndex];
    let window: MemberSlotInfo["window"] = currentOrNextWindow(slot, now);
    if (window.start >= s.cycle.endsAt!) window = null;
    return {
      groupId: s.cycle.groupId,
      groupName: s.cycle.group.name,
      shareId: s.id,
      slot,
      window,
      remaining: s.remaining,
      allowance: s.allowance,
      cycleEndsAt: s.cycle.endsAt!,
    };
  });
}

/** Server-side gate for group-funded chat: active cycle, active membership, inside own slot. */
export async function findUsableShare(db: Db, userId: string, now: Date, shareId?: string) {
  const all = await activeAllowances(db, userId, now);
  const candidates = shareId ? all.filter((a) => a.shareId === shareId) : all;
  const inSlot = candidates.find((a) => isWithinSlot(a.slot, now) && now < a.cycleEndsAt);
  return { inSlot, all: candidates };
}
