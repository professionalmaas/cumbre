// Verify the whole local loop in a real browser, the way a first-time user would see it.
//
//   cd web && npm run verify:local          (the app must already be running on :3000)
//
// Needs the DEV_MODE harness (dev/README.md): Postgres on DATABASE_URL, the Python worker,
// and `npx playwright install chromium` once. Screenshots land in web/.verify/ (gitignored).
//
// What it checks, in order: both demo previews play on the home page, the sample report's
// highlight plays, two uploads in a row each flip from Analyzing to a full report with no
// reload and no paywall, the own-track highlight plays from memory, no credit is debited,
// the uploads are deleted, the share page and profile render, and the console stays clean.
import { chromium } from "playwright";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(web, ".verify");
fs.mkdirSync(OUT, { recursive: true });

// Read DATABASE_URL from web/.env.local the same way Next does (first match wins).
function envLocal(key) {
  if (process.env[key]) return process.env[key];
  const file = path.join(web, ".env.local");
  if (!fs.existsSync(file)) return undefined;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(key + "="));
  return line ? line.slice(key.length + 1).trim() : undefined;
}
const db = new pg.Client({ connectionString: envLocal("DATABASE_URL"), ssl: undefined });
await db.connect();
const one = async (sql, params = []) => String(Object.values((await db.query(sql, params)).rows[0] ?? {})[0] ?? "");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror ${e}`));
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(`console ${m.text()}`); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`); });
const audio = () => page.evaluate(() => [...document.querySelectorAll("audio")].map((a) => ({ paused: a.paused, t: a.currentTime, err: a.error?.code ?? null })));
const playing = (st) => st.some((a) => !a.paused && a.t > 0);
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });

// Home: both demo previews
await page.goto(BASE, { waitUntil: "networkidle" });
const enter = page.getByRole("button", { name: /enter|start|begin|continue/i }).first();
if (await enter.isVisible().catch(() => false)) { await enter.click(); await page.waitForTimeout(600); }
for (const title of ["Ridge Line", "Lantern Pocket"]) {
  await page.getByRole("button", { name: new RegExp(`Play preview of ${title}`, "i") }).click();
  await page.waitForTimeout(1500);
  check(`home demo preview plays: ${title}`, playing(await audio()));
  await page.getByRole("button", { name: new RegExp(`Pause preview of ${title}`, "i") }).click().catch(() => {});
}
await shot("01-home");

// Sample teasers and the sample report highlight
for (const id of ["ridge", "lantern"]) {
  const r = await page.goto(`${BASE}/sample/${id}`, { waitUntil: "networkidle" });
  check(`sample teaser /sample/${id}`, r.status() === 200, `status ${r.status()}`);
}
await page.goto(`${BASE}/report/sample`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /play highlight/i }).click();
await page.waitForTimeout(1500);
check("sample report highlight plays", playing(await audio()));
await shot("02-sample-report");

// Sign in as the dev user, then two uploads back to back
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await Promise.all([page.waitForURL((u) => !String(u).includes("/login")), page.getByRole("button", { name: /dev user/i }).first().click()]);
const balanceBefore = await one("select coalesce(sum(delta),0) from credit_ledger where user_id = 'dev-user'");
const jobs = [];
for (const [file, genre] of [["ridge.wav", "Pop"], ["lantern.wav", "Hip-Hop"]]) {
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles(path.join(web, "public", "samples", file));
  await page.getByRole("button", { name: genre, exact: true }).click().catch(() => {});
  await page.locator('input[type="checkbox"]').first().check();
  await Promise.all([page.waitForURL(/report\//, { timeout: 60000 }), page.locator("button[type=submit]").first().click()]);
  const jobId = page.url().split("/report/")[1];
  jobs.push(jobId);
  const t0 = Date.now();
  let flipped = false;
  while (Date.now() - t0 < 300000) { // first run pays the numba compile; later runs take seconds
    if (/top 3 fixes to reach the summit/i.test(await page.textContent("body"))) { flipped = true; break; }
    await page.waitForTimeout(2000);
  }
  const body = await page.textContent("body");
  check(`${file}: flips to the full report without a reload`, flipped, `${Math.round((Date.now() - t0) / 1000)}s`);
  check(`${file}: no paywall shown`, !/unlock full report|buy a pass/i.test(body));
  check(`${file}: job marked unlocked`, (await one("select unlocked_full from jobs where id = $1", [jobId])) === "true");
  const hl = page.getByRole("button", { name: /play highlight/i }).first();
  if (await hl.isVisible().catch(() => false)) { await hl.click(); await page.waitForTimeout(1500); check(`${file}: own-track highlight plays in session`, playing(await audio())); }
  else check(`${file}: own-track highlight available`, false, "button missing or disabled");
  await shot(`03-full-report-${file.split(".")[0]}`);
}
const balanceAfter = await one("select coalesce(sum(delta),0) from credit_ledger where user_id = 'dev-user'");
check("no credit debited across two analyses", balanceBefore === balanceAfter, `before ${balanceBefore}, after ${balanceAfter}`);
const uploads = path.join(web, ".dev-uploads");
const leftover = fs.existsSync(uploads) ? fs.readdirSync(uploads, { recursive: true }).filter((f) => fs.statSync(path.join(uploads, f)).isFile()).length : 0;
check("uploads deleted after analysis", leftover === 0, `${leftover} file(s) left`);

// Share page and profile
const token = await one("select share_token from results where job_id = $1", [jobs[1]]);
const share = await page.goto(`${BASE}/share/${token}`, { waitUntil: "networkidle" });
check("share page renders", share.status() === 200 && /summit/i.test(await page.textContent("body")));
await shot("04-share");
const profile = await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
check("profile page renders", profile.status() === 200);
check("no console, page or 5xx errors", errors.length === 0, errors.join(" | ").slice(0, 400));

await browser.close();
await db.end();
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed ? 1 : 0);
