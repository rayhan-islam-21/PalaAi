// End-to-end browser test of the main journeys against a running app (demo mode).
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

const browser = await chromium.launch();
const phone = devices["Pixel 7"];

async function settle(page) {
  await page.waitForLoadState("networkidle");
}

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

let txn = 0;
async function payFromCurrentPage(u, id) {
  await settle(u.page);
  await u.page.fill("#senderNumber", "01712345678");
  await u.page.fill("#transactionId", id ?? `E2E${run}${++txn}`.toUpperCase());
  await u.page.click("button:has-text('পেমেন্ট জমা দিন')");
  await u.page.waitForURL(/\/payments\?submitted=1/);
  await u.page.getByText("যাচাই চলছে").first().waitFor();
}

async function approveAll(admin, expected) {
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
  assert.equal(approved, expected, "approved claim count");
}

async function sendChat(page, text) {
  await page.fill("textarea[aria-label='বার্তা']", text);
  await page.click("button[aria-label='পাঠান']");
  await page.getByTestId("last-charge").waitFor({ timeout: 20000 });
}

try {
  // ---------- Admin sets the demo clock to 09:30 Dhaka today ----------
  step("admin login + demo clock 09:30 Dhaka");
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  admin.on("dialog", (d) => d.accept());
  await login(admin, "admin@pala.test", "demo12345");
  await admin.goto(`${BASE}/admin/settings`);
  await settle(admin);
  const dhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  await admin.fill("input[name=demoNow]", `${dhakaDate}T09:30`);
  await admin.click("button:has-text('Set simulated time')");
  await admin.getByText("Simulated clock set").waitFor();

  // ---------- Home page ----------
  step("home page calculator");
  const owner = await newUser("owner");
  await owner.page.goto(BASE);
  await settle(owner.page);
  await owner.page.getByRole("link", { name: /গ্রুপ তৈরি করুন/ }).waitFor();
  await owner.page.getByRole("link", { name: /নিজের জন্য ক্রেডিট নিন/ }).waitFor();
  await owner.page.getByRole("link", { name: /কোড দিয়ে গ্রুপে যোগ দিন/ }).waitFor();
  assert.equal(await owner.page.getByTestId("per-person").textContent(), "৳৬২৫");
  await owner.page.getByRole("radio", { name: "৫ জন" }).click();
  assert.equal(await owner.page.getByTestId("per-person").textContent(), "৳৫০৫");
  await owner.page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true });

  // ---------- Create a 5-person group ----------
  step("owner signs up and creates a 5-person group (slot 09:00–11:30)");
  await owner.page.getByRole("link", { name: /গ্রুপ তৈরি করুন/ }).click();
  await owner.page.waitForURL(/signup/);
  await settle(owner.page);
  await owner.page.fill("#name", owner.name);
  await owner.page.fill("#email", owner.email);
  await owner.page.fill("#password", PASSWORD);
  await owner.page.click("button:has-text('অ্যাকাউন্ট খুলুন')");
  await owner.page.waitForURL((u) => u.pathname === "/groups/new");
  await owner.page.waitForLoadState("networkidle");
  await owner.page.fill("#name", `E2E Group ${run}`);
  await owner.page.click("label:has-text('৫ জন')");
  await owner.page.getByText("৳৫০৫").last().waitFor();
  await owner.page.screenshot({ path: `${SHOTS}/02-create-group.png`, fullPage: true });
  await owner.page.click("form button:has-text('গ্রুপ তৈরি করুন')");
  await owner.page.waitForURL(/groups\/c[a-z0-9]+\?created=1/);
  const groupUrl = owner.page.url().split("?")[0];
  const code = (await owner.page.getByTestId("invite-code").textContent()).trim();
  assert.match(code, /^[A-Z0-9]{6}$/);
  await owner.page.screenshot({ path: `${SHOTS}/03-group-owner.png`, fullPage: true });

  // ---------- Members join by code ----------
  const members = [];
  for (let i = 1; i <= 4; i++) {
    step(`member ${i} joins by code with slot ${i}`);
    const m = await newUser(`m${i}`);
    await signup(m);
    await m.page.goto(`${BASE}/join`);
    await settle(m.page);
    await m.page.fill("input[name=code]", code.toLowerCase());
    await m.page.click("button:has-text('গ্রুপ খুঁজুন')");
    await m.page.waitForURL(new RegExp(`/join/${code}`));
    await settle(m.page);
    if (i === 4) {
      // Race for the last seat: a 6th user has the join page open with slot 4 still free.
      var late = await newUser("late");
      await signup(late);
      await late.page.goto(`${BASE}/join/${code}`);
      await settle(late.page);
      await late.page.locator("input[name=slotIndex][value='4']").check();
    }
    await m.page.locator(`input[name=slotIndex][value='${i}']`).check();
    await m.page.click("button:has-text('যোগ দিন')");
    await m.page.waitForURL(/groups\/.+\?joined=1/);
    members.push(m);
  }
  step("late user loses the race for the last slot");
  await late.page.click("button:has-text('যোগ দিন')");
  await late.page.getByRole("alert").filter({ hasText: /অন্য কেউ|নেওয়া হচ্ছে না/ }).waitFor();

  // ---------- Pending state ----------
  await owner.page.goto(groupUrl);
  const pending = await owner.page.getByTestId("pending-box").textContent();
  assert.match(pending, /৫ জনের পেমেন্ট/);
  assert.ok(!(await owner.page.getByTestId("invite-code").count()), "invite box hidden when full");

  // ---------- Everyone pays ----------
  for (const [i, u] of [owner, ...members].entries()) {
    step(`member ${i} submits bKash payment`);
    await u.page.goto(groupUrl);
    await u.page.click("a:has-text('পেমেন্ট করুন')");
    await u.page.waitForURL(/\/pay\?purpose=GROUP_SHARE/);
    if (i === 0) await u.page.screenshot({ path: `${SHOTS}/04-pay.png`, fullPage: true });
    await payFromCurrentPage(u);
  }
  await owner.page.goto(groupUrl);
  assert.match(await owner.page.getByTestId("pending-box").textContent(), /৫ জনের পেমেন্ট এখনো যাচাই হয়নি/);

  // ---------- Admin approves; group activates ----------
  step("admin approves all five");
  await admin.screenshot({ path: `${SHOTS}/05-admin-settings.png`, fullPage: true });
  await approveAll(admin, 5);
  await owner.page.goto(groupUrl);
  await owner.page.getByText("চালু").first().waitFor();
  assert.equal(await owner.page.getByTestId("pending-box").count(), 0);

  // ---------- Owner chats in slot ----------
  step("owner sees active slot and chats with group allowance");
  await owner.page.goto(`${BASE}/dashboard`);
  await owner.page.getByText("এখন আপনার সময় চলছে").waitFor();
  await owner.page.screenshot({ path: `${SHOTS}/06-dashboard.png`, fullPage: true });
  await owner.page.click("a:has-text('চ্যাট শুরু করুন')");
  await owner.page.waitForURL(/\/chat$/);
  await settle(owner.page);
  assert.match(await owner.page.getByTestId("funding-source").textContent(), /Group allowance/);
  await sendChat(owner.page, "হ্যালো! **Markdown** <script>alert(1)</script> পরীক্ষা");
  const charge = await owner.page.getByTestId("last-charge").textContent();
  assert.match(charge, /গ্রুপ অ্যালাওয়েন্স বাকি/);
  await owner.page.waitForURL(/\/chat\/c/);
  const ownerChatUrl = owner.page.url();
  assert.equal(await owner.page.locator(".prose-chat script").count(), 0, "no raw HTML rendered");
  await owner.page.locator(".prose-chat pre").first().waitFor();
  await owner.page.screenshot({ path: `${SHOTS}/07-chat.png` });

  // ---------- Member outside slot ----------
  step("member 1 (11:30 slot) is outside their slot");
  const m1 = members[0];
  await m1.page.goto(`${BASE}/chat`);
  await settle(m1.page);
  await m1.page.getByText("এখন আপনার গ্রুপের সময় নয়").waitFor();
  assert.ok(await m1.page.locator("textarea[aria-label='বার্তা']").isDisabled(), "composer locked until wallet explicitly chosen");
  await m1.page.click("button:has-text('ব্যক্তিগত ওয়ালেট ব্যবহার করুন')");
  assert.match(await m1.page.getByTestId("funding-source").textContent(), /Personal wallet/);
  await m1.page.fill("textarea[aria-label='বার্তা']", "test");
  assert.ok(await m1.page.locator("button[aria-label='পাঠান']").isDisabled(), "zero wallet cannot send");
  await m1.page.screenshot({ path: `${SHOTS}/08-out-of-slot.png` });

  // Server-side enforcement even if the UI is bypassed.
  const forced = await m1.page.evaluate(async () => {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), text: "hi", source: "GROUP" }) });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(forced.status, 403);
  assert.equal(forced.body.code, "OUT_OF_SLOT");

  // ---------- Privacy ----------
  step("member cannot open the owner's conversation");
  const resp = await m1.page.goto(ownerChatUrl);
  assert.equal(resp.status(), 404);

  // ---------- Personal wallet journey ----------
  step("late user tops up ৳100");
  await late.page.goto(`${BASE}/wallet`);
  await late.page.getByTestId("topup-100").click();
  const dupId = `WAL${run}`.toUpperCase();
  await payFromCurrentPage(late, dupId);
  step("duplicate transaction ID is refused");
  await late.page.goto(`${BASE}/pay?purpose=WALLET_TOPUP&amount=10000`);
  await settle(late.page);
  await late.page.fill("#senderNumber", "01712345678");
  await late.page.fill("#transactionId", dupId.toLowerCase());
  await late.page.click("button:has-text('পেমেন্ট জমা দিন')");
  await late.page.getByRole("alert").filter({ hasText: "আগেই জমা" }).waitFor();
  await approveAll(admin, 1);
  await late.page.goto(`${BASE}/wallet`);
  assert.equal(await late.page.getByTestId("wallet-balance").textContent(), "৳১০০");
  step("late user chats with wallet");
  await late.page.goto(`${BASE}/chat`);
  await settle(late.page);
  await late.page.click("button:has-text('ব্যক্তিগত ওয়ালেট')");
  await sendChat(late.page, "Explain recursion in one line");
  assert.match(await late.page.getByTestId("last-charge").textContent(), /ওয়ালেট বাকি/);
  await late.page.goto(`${BASE}/wallet`);
  const bal = await late.page.getByTestId("wallet-balance").textContent();
  assert.notEqual(bal, "৳১০০", "balance decreased");
  const hist = await late.page.getByTestId("wallet-history").textContent();
  assert.match(hist, /টপ-আপ/);
  assert.match(hist, /চ্যাট খরচ/);
  await late.page.screenshot({ path: `${SHOTS}/09-wallet.png`, fullPage: true });

  // ---------- Admin numbers ----------
  step("admin overview renders separated numbers");
  await admin.goto(`${BASE}/admin`);
  await admin.getByText("Group service fees earned").waitFor();
  await admin.getByText("Unspent wallet balances").waitFor();
  await admin.screenshot({ path: `${SHOTS}/10-admin.png`, fullPage: true });

  // Restore real time.
  await admin.goto(`${BASE}/admin/settings`);
  await settle(admin);
  await admin.fill("input[name=demoNow]", "");
  await admin.click("button:has-text('Set simulated time')");
  await admin.getByText("Using real time").waitFor();

  console.log("\nE2E PASSED");
} catch (e) {
  console.error("\nE2E FAILED:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
