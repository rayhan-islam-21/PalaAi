// End-to-end browser test of the personal-wallet product against a running app (demo mode).
// Usage: BASE_URL=http://localhost:3000 node e2e/journey.mjs
// Requires `npm run db:seed:demo` (admin@pala.test / demo12345 and a demo bKash method).
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require("/opt/node-tools/node_modules/playwright");
}
const { chromium, devices } = playwright;

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const PASSWORD = "testpass123";
const step = (s) => console.log("•", s);
const settle = (page) => page.waitForLoadState("networkidle");

const browser = await chromium.launch();
const phone = devices["Pixel 7"];

async function newUser(label) {
  const ctx = await browser.newContext({ ...phone, locale: "bn-BD" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[${label} pageerror]`, e.message));
  return { ctx, page, email: `${label}-${run}@e2e.test`, name: `${label}-${run}` };
}

async function signup(u, next = "/dashboard") {
  await u.page.goto(`${BASE}/signup?next=${encodeURIComponent(next)}`);
  await settle(u.page);
  await u.page.fill("#name", u.name);
  await u.page.fill("#email", u.email);
  await u.page.fill("#password", PASSWORD);
  await u.page.click("button:has-text('অ্যাকাউন্ট খুলুন')");
  await u.page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await settle(page);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("form button:has-text('লগইন')");
  await page.waitForURL(/dashboard/);
}

async function pay(u, id) {
  await settle(u.page);
  await u.page.fill("#senderNumber", "01712345678");
  await u.page.fill("#transactionId", id);
  await u.page.click("button:has-text('পেমেন্ট জমা দিন')");
}

async function approveAll(admin) {
  await admin.goto(`${BASE}/admin/payments?status=PENDING`);
  await settle(admin);
  let approved = 0;
  for (;;) {
    const claims = admin.getByTestId("claim").filter({ hasText: run.toUpperCase() });
    const before = await claims.count();
    if (!before) break;
    await claims.first().locator("button:has-text('Approve')").click();
    await admin.waitForFunction(
      ([n, r]) => [...document.querySelectorAll("[data-testid=claim]")].filter((e) => e.textContent.includes(r)).length < n,
      [before, run.toUpperCase()],
    );
    approved++;
    await admin.reload();
    await settle(admin);
  }
  return approved;
}

async function sendChat(page, text) {
  await page.fill("textarea[aria-label='বার্তা']", text);
  await page.click("button[aria-label='পাঠান']");
  await page.getByTestId("last-charge").waitFor({ timeout: 20000 });
}

try {
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  admin.on("dialog", (d) => d.accept());
  step("admin login");
  await login(admin, "admin@pala.test", "demo12345");

  step("home page: personal credit only, no group offer");
  const u = await newUser("buyer");
  await u.page.goto(BASE);
  await settle(u.page);
  await u.page.getByRole("link", { name: /ক্রেডিট কিনুন/ }).first().waitFor();
  const html = await u.page.content();
  assert.ok(!html.includes("গ্রুপ তৈরি করুন"), "no group CTA on home");
  await u.page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true });
  {
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const dp = await desk.newPage();
    await dp.goto(BASE);
    await settle(dp);
    await dp.screenshot({ path: `${SHOTS}/00-home-desktop.png`, fullPage: true });
    await desk.close();
  }

  step("sign up and open group pages → redirected");
  await signup(u);
  for (const path of ["/groups", "/groups/new", "/join"]) {
    await u.page.goto(`${BASE}${path}`);
    await u.page.waitForURL(/\/dashboard/);
  }
  await u.page.screenshot({ path: `${SHOTS}/02-dashboard-empty.png`, fullPage: true });

  step("top up ৳100, duplicate TrxID refused");
  await u.page.goto(`${BASE}/wallet`);
  await u.page.getByTestId("topup-100").click();
  const id = `WAL${run}`.toUpperCase();
  await pay(u, id);
  await u.page.waitForURL(/\/payments\?submitted=1/);
  await u.page.goto(`${BASE}/pay?purpose=WALLET_TOPUP&amount=10000`);
  await pay(u, id.toLowerCase());
  await u.page.getByRole("alert").filter({ hasText: "আগেই জমা" }).waitFor();

  step("admin approves; balance appears");
  assert.equal(await approveAll(admin), 1);
  await u.page.goto(`${BASE}/dashboard`);
  assert.equal(await u.page.getByTestId("wallet-balance").textContent(), "৳১০০");

  step("chat uses the wallet by default and shows the charge");
  await u.page.goto(`${BASE}/chat`);
  await settle(u.page);
  assert.match(await u.page.getByTestId("funding-source").textContent(), /Personal wallet/);
  await sendChat(u.page, "Explain recursion in one line");
  assert.match(await u.page.getByTestId("last-charge").textContent(), /ওয়ালেট বাকি/);
  await u.page.waitForURL(/\/chat\/c/);
  const convUrl = u.page.url();
  await u.page.screenshot({ path: `${SHOTS}/03-chat.png` });

  step("group-funded chat is refused by the API");
  const forced = await u.page.evaluate(async () => {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), text: "hi", source: "GROUP" }) });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(forced.status, 403);

  step("wallet history shows top-up and chat charge");
  await u.page.goto(`${BASE}/wallet`);
  assert.notEqual(await u.page.getByTestId("wallet-balance").textContent(), "৳১০০");
  const hist = await u.page.getByTestId("wallet-history").textContent();
  assert.match(hist, /টপ-আপ/);
  assert.match(hist, /চ্যাট খরচ/);
  await u.page.screenshot({ path: `${SHOTS}/04-wallet.png`, fullPage: true });
  await u.page.goto(`${BASE}/dashboard`);
  await u.page.screenshot({ path: `${SHOTS}/05-dashboard.png`, fullPage: true });

  step("another user cannot open that conversation");
  const other = await newUser("other");
  await signup(other);
  const resp = await other.page.goto(convUrl);
  assert.equal(resp.status(), 404);

  step("admin token calculator");
  await admin.goto(`${BASE}/admin/tokens`);
  await settle(admin);
  await admin.click("button:has-text('Bangla leave application')");
  await admin.click("button:has-text('Count tokens & cost')");
  await admin.getByTestId("token-result").waitFor();
  const calc = await admin.getByTestId("token-result").textContent();
  assert.match(calc, /Sonnet 5\.5/);
  assert.match(calc, /Opus 5\.5/);
  await admin.screenshot({ path: `${SHOTS}/06-token-calculator.png`, fullPage: true });
  await admin.goto(`${BASE}/admin`);
  await admin.screenshot({ path: `${SHOTS}/07-admin.png`, fullPage: true });

  console.log("\nE2E PASSED");
} catch (e) {
  console.error("\nE2E FAILED:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
