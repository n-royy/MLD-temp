#!/usr/bin/env node
/**
 * BUG-01 layout check. Signs in to the running app, opens Dashboard, Accounting and Boards at
 * 1440×900, 1024×768 and 390×844, and records where the sidebar, top bar, main content and mobile
 * navigation are drawn. Writes a fixed-format JSON report for the evidence folder.
 *
 * Usage, from the src/ folder (it uses the app's own Playwright dev dependency):
 *   node <path>/BUG-01-layout-check.mjs <base-url> <development|production> <report.json>
 *   e.g. node ../BUG-01-layout-check.mjs http://localhost:3000 development ../answers/BUG-01/evidence/layout-report-dev.json
 *
 * Sign-in uses ADMIN_EMAIL / ADMIN_PASSWORD from the environment, else the seed defaults.
 * Browser: Playwright's Chromium if installed (pnpm exec playwright install chromium), otherwise
 * the installed Microsoft Edge or Google Chrome. Do not edit the report.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";

const [, , baseUrl, mode, outPath] = process.argv;
if (!baseUrl || !["development", "production"].includes(mode) || !outPath) {
  console.error("Usage: node BUG-01-layout-check.mjs <base-url> <development|production> <report.json>");
  process.exit(2);
}
const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.error("Run this script from the src/ folder after pnpm install (playwright is a dev dependency).");
  process.exit(2);
}

async function launch() {
  const errors = [];
  for (const options of [{}, { channel: "msedge" }, { channel: "chrome" }]) {
    try { return await chromium.launch({ headless: true, ...options }); } catch (error) { errors.push(String(error.message).split("\n")[0]); }
  }
  throw new Error(`No browser available. Run: pnpm exec playwright install chromium\n${errors.join("\n")}`);
}

const VIEWPORTS = [[1440, 900], [1024, 768], [390, 844]];
const PAGES = ["/dashboard", "/accounting", "/boards"];
const email = process.env.ADMIN_EMAIL ?? "morpheusadam95";
const password = process.env.ADMIN_PASSWORD ?? "change-me-please";
const url = (route) => new URL(route, baseUrl).toString();

function measure() {
  const box = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return null;
    return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      width: Math.round(rect.width), height: Math.round(rect.height) };
  };
  const width = window.innerWidth;
  const height = window.innerHeight;
  const navs = [...document.querySelectorAll("nav")].map(box).filter(Boolean);
  return {
    sidebar: navs.find((rect) => rect.height >= height * 0.6 && rect.width < width * 0.5) ?? null,
    bottomNav: navs.find((rect) => rect.bottom >= height - 2 && rect.width >= width * 0.9 && rect.height < height * 0.3) ?? null,
    header: box(document.querySelector("header")),
    main: box(document.querySelector("main"))
  };
}

const browser = await launch();
const results = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url("/dashboard"), { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await Promise.all([page.waitForURL((target) => !target.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
  }
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const route of PAGES) {
      await page.goto(url(route), { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      results.push({ viewport: `${width}x${height}`, page: route, finalPath: new URL(page.url()).pathname, ...(await page.evaluate(measure)) });
    }
  }
} finally {
  await browser.close();
}

const report = { schemaVersion: 1, generatedBy: "BUG-01-layout-check", mode, baseUrl, generatedAt: new Date().toISOString(), results };
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`BUG-01 layout report (${mode}): ${results.length} measurements -> ${outPath}`);
