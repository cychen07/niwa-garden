import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createInitialGarden, SAVE_KEY } from "../src/game/model.ts";
import { blankGarden } from "../src/game/templates.ts";
import { suppressOnboarding } from "./onboarding-test.mjs";

const output = new URL("../artifacts/ambience-reference-camera/", import.meta.url);
const DRAFT_KEY = "niwa-active-draft";
await mkdir(output, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = (await readdir(cache)).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = builds
    .map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell"))
    .find(existsSync);
}
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const button = (page, name) => page.getByRole("button", { name, exact: true });
const results = [];

async function ready(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".editor-scene canvas");
    return canvas && canvas.width > 10 && canvas.toDataURL().length > 20000;
  });
}

async function frame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator(".editor-scene canvas").evaluate((canvas) => canvas.toDataURL());
}

async function save(page) {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

async function drag(page, from, to, buttonName = "left") {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: buttonName });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up({ button: buttonName });
}

async function layout(page) {
  const issues = await page.evaluate(() => {
    const selectors = [
      ".brand-lockup",
      ".project-controls",
      ".top-actions",
      ".view-tools",
      ".creation-nav",
      ".creation-clock",
      ".tool-rail",
      ".catalog-panel",
      ".tool-settings",
      ".environment-trigger",
      ".music-control",
      ".template-reference",
    ];
    const rects = selectors.flatMap((selector) => {
      const node = document.querySelector(selector);
      if (!node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") return [];
      const rect = node.getBoundingClientRect();
      return rect.width && rect.height
        ? [{ selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }]
        : [];
    });
    return {
      overflow: rects.filter((rect) =>
        rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1),
      overlaps: rects.flatMap((a, index) => rects.slice(index + 1)
        .filter((b) =>
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1)
        .map((b) => `${a.selector}/${b.selector}`)),
    };
  });
  assert.deepEqual(issues, { overflow: [], overlaps: [] });
}

try {
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
    const fixture = createInitialGarden();
    fixture.marks = [];
    await context.addInitScript(({ key, garden }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(garden));
    }, { key: SAVE_KEY, garden: fixture });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await ready(page);

    assert.equal(await page.locator(".music-track strong").innerText(), "溪桥初晴");
    await button(page, "下一首庭院音乐").click();
    await page.waitForFunction(() => document.querySelector(".music-control")?.dataset.track === "1");
    assert.equal(await page.locator(".music-track strong").innerText(), "竹影午后");
    await page.waitForFunction(() => document.querySelector(".music-control")?.dataset.playing === "true");
    assert.equal(await page.locator(".music-control").getAttribute("data-playing"), "true");
    await button(page, "关闭庭院音乐").click();
    assert.ok(await button(page, "播放庭院音乐").isVisible());
    await button(page, "播放庭院音乐").click();
    await page.waitForFunction(() => document.querySelector(".music-control")?.dataset.playing === "true");

    await button(page, "光景设置").click();
    await button(page, "夏").click();
    await button(page, "关闭光景设置").click();
    await button(page, "苔藓").click();
    const baseline = await save(page);
    await button(page, "复位视角").click();
    const initial = await frame(page);

    await drag(page, { x: 1190, y: 520 }, { x: 1320, y: 560 });
    assert.notEqual(await frame(page), initial, "Left drag outside the garden did not rotate in build mode");
    assert.deepEqual(await save(page), baseline, "Outside view drag edited the garden");

    await button(page, "复位视角").click();
    const reset = await frame(page);
    await page.keyboard.down("Space");
    await drag(page, { x: 720, y: 500 }, { x: 860, y: 540 });
    await page.keyboard.up("Space");
    assert.notEqual(await frame(page), reset, "Space + left drag did not rotate in build mode");
    assert.deepEqual(await save(page), baseline, "Space view drag edited the garden");

    await button(page, "复位视角").click();
    const resetAgain = await frame(page);
    await drag(page, { x: 720, y: 500 }, { x: 850, y: 520 }, "middle");
    assert.notEqual(await frame(page), resetAgain, "Middle drag did not rotate in build mode");
    assert.deepEqual(await save(page), baseline, "Middle view drag edited the garden");

    const beforeWheel = await frame(page);
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, -240);
    assert.notEqual(await frame(page), beforeWheel, "Wheel zoom did not work in build mode");
    assert.deepEqual(await save(page), baseline, "Wheel zoom edited the garden");
    await layout(page);
    await page.screenshot({ path: new URL("desktop-music-and-camera.png", output).pathname });
    assert.deepEqual(errors, []);
    results.push({ name: "music-and-always-available-camera", status: "passed" });
    await context.close();
  }

  for (const viewport of [
    { name: "desktop-reference", width: 1440, height: 960 },
    { name: "mobile-reference", width: 390, height: 844 },
    { name: "small-mobile-reference", width: 320, height: 640 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 720,
      isMobile: viewport.width < 720,
      reducedMotion: "reduce",
    });
    const garden = blankGarden(13);
    const draft = {
      garden,
      meta: {
        id: "template-reference-test",
        seconds: 0,
        templateId: "dry",
        title: "",
        author: "",
      },
    };
    await context.addInitScript(({ saveKey, draftKey, draft }) => {
      localStorage.clear();
      localStorage.setItem(saveKey, JSON.stringify(draft.garden));
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, { saveKey: SAVE_KEY, draftKey: DRAFT_KEY, draft });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await ready(page);
    const reference = page.getByLabel("范例参照：白砂听松", { exact: true });
    await reference.waitFor({ state: "visible" });
    assert.equal(await reference.locator("canvas").count(), 1);
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".template-reference canvas");
      return canvas && canvas.toDataURL().length > 3000;
    });
    await layout(page);
    await page.screenshot({ path: new URL(`${viewport.name}.png`, output).pathname });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByLabel("范例参照：白砂听松", { exact: true }).waitFor({ state: "visible" });
    results.push({ name: viewport.name, status: "passed" });
    await context.close();
  }

  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
