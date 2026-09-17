import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";
import { createInitialGarden, resizeGarden, SAVE_KEY } from "../src/game/model.ts";

const output = new URL("../artifacts/size-camera/", import.meta.url);
await mkdir(output, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = (await readdir(cache)).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = builds.map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell")).find(existsSync);
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const button = (page, name) => page.getByRole("button", { name, exact: true });
const save = async (page) => {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
};
const shot = async (page, name) => {
  await page.mouse.move(1, 1);
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname });
};
async function ready(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".editor-scene canvas");
    if (!canvas || canvas.width < 10) return false;
    const sample = new OffscreenCanvas(80, 80), ctx = sample.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 80, 80);
    const pixels = ctx.getImageData(0, 0, 80, 80).data, colors = new Set();
    for (let i = 0; i < pixels.length; i += 16) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size > 20;
  });
}
async function layout(page) {
  // Sample after a paint so style invalidation has followed the input event.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const { debug, ...result } = await page.evaluate(() => {
    const selectors = [".brand-lockup", ".project-title", ".size-rail", ".size-feedback", ".top-actions", ".view-tools",
      ".creation-nav", ".creation-clock", ".tool-rail", ".catalog-panel", ".tool-settings", ".environment-trigger"];
    const rects = selectors.flatMap((s) => {
      const node = document.querySelector(s);
      if (!node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") return [];
      const r = node.getBoundingClientRect();
      return [{ s, x: r.x, y: r.y, right: r.right, bottom: r.bottom }];
    });
    return {
      overflow: rects.filter((r) => r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1),
      overlaps: rects.flatMap((a, i) => rects.slice(i + 1).filter((b) =>
        a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1).map((b) => [a.s, b.s])),
      // #region debug-point A:phase B:styles C:bounds
      debug: {
        phase: document.querySelector(".garden-size-control")?.dataset.phase,
        app: document.querySelector(".app-shell")?.className,
        viewport: [innerWidth, innerHeight],
        media: matchMedia("(min-width: 721px) and (max-width: 920px)").matches,
        selector: document.querySelector(".view-tools")?.matches('.app-shell:has(.garden-size-control:not([data-phase="idle"])) .view-tools'),
        visibility: getComputedStyle(document.querySelector(".view-tools")).visibility,
        rules: Array.from(document.styleSheets).flatMap((sheet) => {
          try { return Array.from(sheet.cssRules).filter((rule) => rule.cssText.includes(":has")).map((rule) => rule.cssText); }
          catch { return []; }
        }),
        rects,
      },
      // #endregion
    };
  });
  // #region debug-point A:phase B:styles C:bounds
  if (process.env.DEBUG_SESSION_ID === "size-toolbar-overlap") {
    for (const [hypothesisId, data] of Object.entries({ A: { phase: debug.phase, app: debug.app, viewport: debug.viewport }, B: { media: debug.media, selector: debug.selector, visibility: debug.visibility, rules: debug.rules }, C: { rects: debug.rects, result } })) await fetch(process.env.DEBUG_SERVER_URL, { method: "POST", body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID, runId: process.env.DEBUG_RUN_ID ?? "pre-fix", hypothesisId, location: "verify-size-camera:layout", msg: "[DEBUG] Layout sample", data, ts: Date.now() }) }).catch(() => {});
    if (result.overlaps.length) {
      const settled = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve({ phase: document.querySelector(".garden-size-control")?.dataset.phase, app: document.querySelector(".app-shell")?.className, visibility: getComputedStyle(document.querySelector(".view-tools")).visibility }))));
      await fetch(process.env.DEBUG_SERVER_URL, { method: "POST", body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID, runId: process.env.DEBUG_RUN_ID ?? "pre-fix", hypothesisId: "C", location: "verify-size-camera:next-frame", msg: "[DEBUG] Settled sample", data: settled, ts: Date.now() }) }).catch(() => {});
      await page.screenshot({ path: new URL("overlap-debug.png", output).pathname });
      const painted = await page.evaluate(() => ({ phase: document.querySelector(".garden-size-control")?.dataset.phase, app: document.querySelector(".app-shell")?.className, visibility: getComputedStyle(document.querySelector(".view-tools")).visibility }));
      await fetch(process.env.DEBUG_SERVER_URL, { method: "POST", body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID, runId: process.env.DEBUG_RUN_ID ?? "pre-fix", hypothesisId: "C", location: "verify-size-camera:after-paint", msg: "[DEBUG] Painted sample", data: painted, ts: Date.now() }) }).catch(() => {});
    }
  }
  // #endregion
  assert.deepEqual(result, { overflow: [], overlaps: [] });
}
async function phase(page, value) {
  await page.waitForFunction((v) => document.querySelector(".garden-size-control")?.dataset.phase === v, value);
}
async function topMetrics(page) {
  return page.locator(".editor-scene canvas").evaluate((canvas) => {
    const sample = new OffscreenCanvas(canvas.width, canvas.height), ctx = sample.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
    const background = Array.from(data.slice(0, 3));
    let minX = sample.width, minY = sample.height, maxX = 0, maxY = 0;
    const rows = [];
    for (let y = 0; y < sample.height; y++) {
      let left = sample.width, right = 0;
      for (let x = 0; x < sample.width; x++) {
        const i = (y * sample.width + x) * 4;
        if (Math.max(...background.map((v, c) => Math.abs(data[i + c] - v))) < 40) continue;
        left = Math.min(left, x); right = Math.max(right, x);
      }
      if (right <= left) continue;
      rows.push({ y, left, right });
      minX = Math.min(minX, left); maxX = Math.max(maxX, right); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const widths = [0.2, 0.5, 0.8].map((p) => {
      const row = rows.find((r) => r.y === Math.round(minY + (maxY - minY) * p));
      return row ? row.right - row.left + 1 : 0;
    });
    return { width: maxX - minX + 1, height: maxY - minY + 1, widths,
      minX, minY, maxX, maxY, canvasWidth: sample.width, canvasHeight: sample.height };
  });
}
const results = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 960 },
    { name: "tablet", width: 900, height: 760 },
    { name: "narrow-tablet", width: 721, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 640 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.width < 720 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await ready(page);
    await layout(page);
    await shot(page, `${viewport.name}-idle`);
    const baseline = await save(page);
    const slider = page.getByRole("slider", { name: "庭院尺寸", exact: true });
    assert.equal(await slider.isVisible(), true);
    assert.equal(await page.locator(".size-feedback").count(), 0);
    const box = await slider.boundingBox();
    const at = (size) => box.x + 8 + (box.width - 16) * (size - 7) / 12;
    const y = box.y + box.height / 2;
    await page.mouse.move(at(11), y); await page.mouse.down();
    await page.mouse.move(at(19), y, { steps: 6 });
    await phase(page, "dragging");
    assert.match(await page.locator(".size-feedback").innerText(), /19 × 19[\s\S]*共 361 格/);
    assert.equal(await button(page, "确认尺寸调整").isVisible(), false);
    assert.match(await page.locator(".project-title").innerText(), /11 × 11/);
    await layout(page);
    await page.screenshot({ path: new URL(`${viewport.name}-dragging.png`, output).pathname });
    await page.mouse.up();
    await phase(page, "pending");
    await shot(page, `${viewport.name}-confirm`);
    await button(page, "确认尺寸调整").waitFor({ state: "visible" });
    await button(page, "取消尺寸调整").click();
    await phase(page, "idle");
    assert.equal(await slider.inputValue(), "11");
    assert.deepEqual(await save(page), baseline);
    await page.mouse.move(at(11), y); await page.mouse.down(); await page.mouse.up();
    await phase(page, "idle");
    assert.equal(await page.locator(".size-feedback").count(), 0);

    await slider.press("End");
    await phase(page, "pending");
    await slider.press("Enter");
    await phase(page, "idle");
    const expanded = await save(page);
    assert.equal(expanded.size, 19);
    assert.equal(await page.locator(".size-feedback").count(), 0);
    await button(page, "撤销").click();
    assert.deepEqual(await save(page), baseline);
    assert.equal(await slider.inputValue(), "11");
    await button(page, "重做").click();
    assert.deepEqual(await save(page), expanded);

    if (viewport.width < 720) {
      const cdp = await context.newCDPSession(page);
      const touch = (x) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch(at(19)) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(at(11)) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch(at(7)) });
      await phase(page, "dragging");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await phase(page, "pending");
      await cdp.detach();
    } else {
      await slider.press("Home");
    }
    assert.match(await page.locator(".size-feedback").innerText(), /裁去外围 312 格/);
    await layout(page);
    await shot(page, `${viewport.name}-shrink`);
    await button(page, "确认尺寸调整").click();
    await phase(page, "idle");
    const shrunk = await save(page);
    assert.equal(shrunk.size, 7);
    assert.equal(shrunk.objects.length, expanded.objects.length);
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await save(page), shrunk);
    assert.equal(await slider.inputValue(), "7");

    await slider.press("End"); await slider.press("Escape");
    await phase(page, "idle");
    assert.equal(await slider.inputValue(), "7");
    assert.deepEqual(await save(page), shrunk);
    // Close before replacing the fixture so pagehide cannot rewrite the saved draft.
    const flat = resizeGarden(createInitialGarden(), 15);
    flat.objects = []; flat.marks = []; flat.terrain.heights.fill(0.16);
    await page.close();
    const squarePage = await context.newPage();
    await squarePage.addInitScript(({ flat, key }) => {
      localStorage.removeItem("niwa-active-draft");
      localStorage.setItem(key, JSON.stringify(flat));
    }, { flat, key: SAVE_KEY });
    await squarePage.goto(baseURL, { waitUntil: "networkidle" });
    await ready(squarePage);
    assert.equal((await save(squarePage)).size, 15);
    await button(squarePage, "光景设置").click();
    await button(squarePage, "夏").click();
    await button(squarePage, "关闭光景设置").click();
    await button(squarePage, "旋转视角").click();
    await squarePage.mouse.move(viewport.width / 2, viewport.height / 2);
    await squarePage.mouse.down();
    await squarePage.mouse.move(viewport.width / 2 + 70, viewport.height / 2 + 30, { steps: 3 });
    await squarePage.mouse.up();
    await button(squarePage, "正俯视").click();
    await squarePage.waitForTimeout(200);
    const square = await topMetrics(squarePage);
    assert.ok(square.width > 80 && Math.abs(square.width - square.height) <= 2, `Not square: ${JSON.stringify(square)}`);
    assert.ok(Math.max(...square.widths) - Math.min(...square.widths) <= 2, `Trapezoid edges: ${JSON.stringify(square)}`);
    assert.ok(square.minX > 0 && square.minY > 0 && square.maxX < square.canvasWidth - 1 && square.maxY < square.canvasHeight - 1);
    await shot(squarePage, `${viewport.name}-top-square`);
    await button(squarePage, "正俯视").click();
    const repeated = await topMetrics(squarePage);
    assert.equal(repeated.width, square.width);
    await button(squarePage, "复位视角").click();
    await shot(squarePage, `${viewport.name}-reset`);
    await layout(squarePage);
    assert.deepEqual(errors, []);
    results.push({ viewport: viewport.name, status: "passed", square });
    console.log(`${viewport.name}: drag, confirm, history, square pixels passed`);
    await context.close();
  }
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
