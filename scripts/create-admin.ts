// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-password' npm run admin:create
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { upsertPasswordUser } from "./users";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).");
  process.exit(1);
}
const db = new PrismaClient();
upsertPasswordUser(db, { email, password, name: "Admin", role: "ADMIN" })
  .then((u) => console.log(`Admin ready: ${u.email}`))
  .finally(() => db.$disconnect());
