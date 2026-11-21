/**
 * Demo mode must be enabled explicitly and can never run on a Vercel production deployment.
 */
export function isDemoMode(): boolean {
  if (process.env.PALA_DEMO_MODE !== "true") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0;
}

/** Public base URL. Falls back to Vercel's production domain when not set explicitly. */
export function appUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || vercel || "http://localhost:3000").replace(/\/$/, "");
}

/** Origins allowed to call the auth API (production domain plus this deployment's own URL on Vercel). */
export function trustedOrigins(): string[] {
  const list = [appUrl()];
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) list.push(`https://${host}`);
  }
  return [...new Set(list)];
}
