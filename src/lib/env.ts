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

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
