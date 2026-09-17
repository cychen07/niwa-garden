import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { OrthographicCamera, Vector3 } from "three";
import { cameraFrame, CAMERA_TARGET, DEFAULT_CAMERA_POSITION } from "../src/game/camera.ts";
import { createInitialGarden, heightAt, SAVE_KEY } from "../src/game/model.ts";
import { suppressOnboarding } from "./onboarding-test.mjs";

const output = new URL("../artifacts/build-catalog/", import.meta.url);
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
const sectionTab = (page, name) => page.locator(".catalog-sections button").filter({ hasText: name }).first();
const results = [];

function screen(viewport, garden, x, z, extraHeight = 0) {
  const camera = new OrthographicCamera(
    -viewport.width / 2,
    viewport.width / 2,
    viewport.height / 2,
    -viewport.height / 2,
    0.1,
    100,
  );
  const { zoom, offsetY } = cameraFrame(viewport.width, viewport.height, garden.size);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(...CAMERA_TARGET);
  camera.zoom = zoom;
  camera.setViewOffset(viewport.width, viewport.height, 0, offsetY, viewport.width, viewport.height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(x - 5, heightAt(garden, { x, z }) + extraHeight, z - 5).project(camera);
  return {
    x: (point.x + 1) * viewport.width / 2,
    y: (1 - point.y) * viewport.height / 2,
  };
}

async function save(page) {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

async function layout(page) {
  const result = await page.evaluate(() => {
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
      viewport: [innerWidth, innerHeight],
      overflow: rects.filter((rect) =>
        rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1),
      overlap: rects.flatMap((a, index) => rects.slice(index + 1)
        .filter((b) =>
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1)
        .map((b) => `${a.selector}/${b.selector}`)),
    };
  });
  assert.deepEqual(result.overflow, []);
  assert.deepEqual(result.overlap, []);
  return result;
}

async function ready(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".editor-scene canvas");
    return canvas && canvas.width > 10 && canvas.toDataURL().length > 20000;
  });
}

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 960 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 640 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name !== "desktop",
      isMobile: viewport.name !== "desktop",
      reducedMotion: "reduce",
    });
    const fixture = createInitialGarden();
    const baselineCount = fixture.objects.length;
    await context.addInitScript(({ key, garden }) => localStorage.setItem(key, JSON.stringify(garden)), {
      key: SAVE_KEY,
      garden: fixture,
    });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await ready(page);

    assert.equal(await page.locator(".tool-rail button").count(), 5);
    const initiallyOpen = await page.locator(".catalog-dock").evaluate((node) => node.classList.contains("open"));
    assert.equal(initiallyOpen, viewport.name === "desktop");

    if (viewport.name === "desktop") {
      await button(page, "植栽").hover();
      assert.equal(await page.locator(".catalog-header strong").innerText(), "地面", "Hover changed the category");
    }

    await button(page, "植栽").click();
    await page.locator(".catalog-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector(".catalog-header strong")?.textContent === "植栽");
    assert.equal(await page.locator(".catalog-dock").evaluate((node) => node.classList.contains("open")), true);
    assert.equal(await page.locator(".transform-settings").isVisible(), false, "Category click armed an object");
    assert.deepEqual(await page.locator(".catalog-sections button").allTextContents(), ["乔木", "花草"]);
    await sectionTab(page, "花草").click();
    await button(page, "杜鹃").hover();
    assert.equal(await page.locator(".catalog-preview-card strong").innerText(), "杜鹃");
    assert.equal(await button(page, "杜鹃").getAttribute("aria-pressed"), "false");
    await button(page, "杜鹃").click();

    const drawerAfterChoice = await page.locator(".catalog-dock").evaluate((node) => node.classList.contains("open"));
    assert.equal(drawerAfterChoice, viewport.name === "desktop");
    const controls = page.locator(".transform-settings");
    await controls.waitFor({ state: "visible" });
    assert.deepEqual(await controls.getByRole("slider").evaluateAll((nodes) =>
      nodes.map((node) => ({ name: node.getAttribute("aria-label"), min: node.min, max: node.max, step: node.step }))), [
      { name: "物件旋转", min: "0", max: "315", step: "45" },
      { name: "物件缩放", min: "0.4", max: "2", step: "0.05" },
    ]);

    if (viewport.name === "desktop") await button(page, "收起素材目录").click();
    const target = screen(viewport, fixture, 7.2, 7.4);
    if (viewport.name === "desktop") await page.mouse.click(target.x, target.y);
    else await page.touchscreen.tap(target.x, target.y);
    let current = await save(page);
    assert.equal(current.objects.length, baselineCount + 1);
    assert.equal(current.objects.at(-1).kind, "azalea");
    assert.equal(await button(page, "选取与移动").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".catalog-dock").evaluate((node) => node.classList.contains("open")), false);

    const rotation = page.getByRole("slider", { name: "物件旋转" });
    await rotation.focus();
    await rotation.press("ArrowRight");
    current = await save(page);
    assert.ok(Math.abs(current.objects.at(-1).rotation - Math.PI / 4) < 0.0001);
    await page.getByRole("slider", { name: "物件缩放" }).fill("1.35");
    current = await save(page);
    assert.equal(current.objects.at(-1).scale, 1.35);

    await layout(page);
    await page.mouse.move(2, 2);
    await page.screenshot({ path: new URL(`${viewport.name}-selected.png`, output).pathname });
    await button(page, "删除选中物件").click();
    assert.equal((await save(page)).objects.length, baselineCount);

    await button(page, "构筑").click();
    await sectionTab(page, "建筑").click();
    assert.ok(await button(page, "茶亭").isVisible());
    await page.mouse.move(2, 2);
    await page.screenshot({ path: new URL(`${viewport.name}-catalog.png`, output).pathname });
    await layout(page);
    assert.deepEqual(errors, []);
    results.push({ viewport: viewport.name, status: "passed" });
    await context.close();
    console.log(`${viewport.name}: catalog, placement and contextual controls passed`);
  }
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
