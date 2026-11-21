import type { Db } from "./db";
import { isDemoMode } from "./env";

/**
 * Current time for business rules. In demo mode an admin can set a simulated
 * clock (Setting.demoNow) to try slots at any hour; production always uses real time.
 * Service functions take `now` explicitly so tests inject their own clock.
 */
export async function currentTime(db: Db): Promise<Date> {
  if (!isDemoMode()) return new Date();
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { demoNow: true, demoSetAt: true } });
  if (!s?.demoNow) return new Date();
  // Simulated clock keeps ticking from the moment it was set.
  const elapsed = s.demoSetAt ? Date.now() - s.demoSetAt.getTime() : 0;
  return new Date(s.demoNow.getTime() + Math.max(0, elapsed));
}
