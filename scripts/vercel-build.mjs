// Build entry for Vercel: apply migrations, seed default settings, optionally create the admin, then build.
// Locally (no VERCEL env) it only runs the normal build.
import { execSync } from "node:child_process";

const env = { ...process.env };
// Accept the variable names Vercel's Neon integration creates.
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
env.DIRECT_URL ||= env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });

run("npx prisma generate");
if (process.env.VERCEL) {
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add a Neon database in Vercel (Storage) or set DATABASE_URL/DIRECT_URL.");
    process.exit(1);
  }
  if (!env.BETTER_AUTH_SECRET && env.VERCEL_ENV === "production") {
    console.error("BETTER_AUTH_SECRET is not set. Add a long random value in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  run("npx prisma migrate deploy");
  run("npx tsx prisma/seed.ts");
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    // A bad admin setting must not take the whole site down: warn and continue.
    try {
      run("npx tsx scripts/create-admin.ts");
    } catch {
      console.warn("WARNING: admin account was NOT created. Fix ADMIN_EMAIL / ADMIN_PASSWORD (8+ characters) and redeploy.");
    }
  }
}
run("npx next build");
