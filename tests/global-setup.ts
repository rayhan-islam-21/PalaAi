import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/** Recreate the dedicated test database schema and apply migrations. Refuses non-test databases. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/pala_test?schema=public";
  if (!/_test\b|_test\?/.test(url)) throw new Error(`Refusing to wipe non-test database: ${url}`);
  const p = new PrismaClient({ datasources: { db: { url } } });
  await p.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await p.$executeRawUnsafe("CREATE SCHEMA public");
  await p.$disconnect();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
}
