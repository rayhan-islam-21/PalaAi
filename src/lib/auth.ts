import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { appUrl, isDemoMode, trustedOrigins } from "./env";

export const auth = betterAuth({
  baseURL: appUrl(),
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "USER", input: false },
      phone: { type: "string", required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // Brute-force protection; relaxed only in local demo mode so one machine can play many users.
  rateLimit: { enabled: !isDemoMode(), window: 60, max: 30 },
  plugins: [nextCookies()],
});
