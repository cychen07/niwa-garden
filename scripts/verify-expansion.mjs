import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { OrthographicCamera, Vector3 } from "three";
import { cameraFrame, CAMERA_TARGET, DEFAULT_CAMERA_POSITION } from "../src/game/camera.ts";
import {
  createInitialGarden, resizeGarden, parseGarden, terrainGrid, heightAt, surfaceAt, inGarden,
  GARDEN_SIZES, SAVE_KEY, PREVIOUS_SAVE_KEY,
} from "../src/game/model.ts";
import { suppressOnboarding } from "./onboarding-test.mjs";

const output = new URL("../artifacts/expansion/", import.meta.url);
await mkdir(output, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = (await readdir(cache)).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = builds.map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell")).find(existsSync);
}
const browser = await chromium.launch({
  headless: true, ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const button = (page, name) => page.getByRole("button", { name, exact: true });
const sectionTab = (page, name) => page.locator(".catalog-sections button").filter({ hasText: name }).first();
const save = async (page) => {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
};
const screenshot = async (page, name) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname });
};
const waitScene = (page) => page.waitForFunction(() => (document.querySelector("canvas")?.toDataURL().length ?? 0) > 18000);

function project(viewport, garden, x, z, dy = 0) {
  const { width: w, height: h } = viewport;
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100);
  const { zoom, offsetY } = cameraFrame(w, h, garden.size);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(...CAMERA_TARGET);
  camera.zoom = zoom;
  camera.setViewOffset(w, h, 0, offsetY, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(x - 5, heightAt(garden, { x, z }) + dy, z - 5).project(camera);
  return { x: (point.x + 1) * w / 2, y: (1 - point.y) * h / 2 };
}

async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function chooseSize(page, size, apply = true) {
  const slider = page.getByRole("slider", { name: "庭院尺寸", exact: true });
  await slider.fill(String(size));
  const feedback = page.locator(".size-feedback");
  assert.equal(await feedback.isVisible(), true);
  if (apply) await button(page, "确认尺寸调整").click();
  return feedback;
}

async function layoutAndPixels(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2");
    const colors = new Set(), pixel = new Uint8Array(4);
    for (let y = 2; y < 20; y += 1) for (let x = 2; x < 20; x += 1) {
      gl.readPixels(Math.floor(canvas.width * x / 22), Math.floor(canvas.height * y / 22), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      colors.add(Array.from(pixel).join(","));
    }
    const rects = [".brand-lockup", ".project-controls", ".top-actions", ".tool-rail", ".catalog-panel", ".tool-settings", ".view-tools", ".environment-trigger", ".creation-nav"]
      .flatMap((selector) => {
        const node = document.querySelector(selector);
        if (!node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") return [];
        const rect = node.getBoundingClientRect();
        return rect.width && rect.height ? [{ selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }] : [];
      });
    const overflow = rects.filter((r) => r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1);
    const overlaps = rects.flatMap((a, i) => rects.slice(i + 1)
      .filter((b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)
      .map((b) => `${a.selector}/${b.selector}`));
    return { colors: colors.size, overflow, overlaps };
  });
  assert.ok(result.colors > 10, "Scene is blank");
  assert.deepEqual(result.overflow, []);
  assert.deepEqual(result.overlaps, []);
  return result;
}

const additions = [
  ["植栽", "乔木", "樱花", "cherry", -1.5, -1],
  ["植栽", "花草", "杜鹃", "azalea", 2, -2],
  ["植栽", "花草", "鸢尾", "iris", 6, -2],
  ["构筑", "道路围合", "飞石", "stepping", 10, -2],
  ["构筑", "道路围合", "竹篱", "fence", 13, 1],
  ["构筑", "建筑", "鸟居", "torii", 13, 5],
  ["构筑", "建筑", "茶亭", "pavilion", 11.5, 11.5],
  ["摆件", "庭院生活", "长凳", "bench", 6, 12.5],
  ["构筑", "建筑", "石塔", "pagoda", 1.5, 12],
  ["摆件", "石与水", "鹿威", "shishi", -1, 7.5],
];
const results = [];
try {
  const initial = createInitialGarden();
  for (const size of GARDEN_SIZES) {
    const resized = resizeGarden(initial, size);
    assert.equal(resized.terrain.heights.length, terrainGrid(size).side ** 2);
    assert.equal(resized.objects.length, initial.objects.length);
    assert.ok(resized.objects.every((item) => inGarden(item, size)));
    assert.deepEqual(parseGarden(resized), resized);
    assert.ok(Math.abs(heightAt(initial, { x: 5, z: 5 }) - heightAt(resized, { x: 5, z: 5 })) < 0.001);
    for (const height of [-0.08, 2.2]) {
      const saturated = createInitialGarden();
      saturated.terrain.heights.fill(height);
      const atLimit = resizeGarden(saturated, size);
      assert.ok(parseGarden(atLimit), `Size ${size} invalidated terrain at height ${height}`);
      assert.ok(atLimit.terrain.heights.every((sample) => Math.abs(sample - height) < 0.000001));
    }
  }
  assert.equal(resizeGarden(initial, 12), initial, "Unsupported size was accepted");
  assert.equal(parseGarden({ ...initial, size: 99 }), null);
  const previous = { ...initial, version: 2 };
  delete previous.size;
  assert.deepEqual(parseGarden(previous), initial, "V2 migration changed terrain");

  for (const viewport of [
    { name: "desktop", width: 1440, height: 960 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 640 },
  ]) {
    console.log(`${viewport.name}: starting`);
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.name !== "desktop" });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(process.env.BASE_URL ?? "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await waitScene(page);
    const baseline = await save(page);
    await chooseSize(page, 19);
    let expanded = await save(page);
    assert.equal(expanded.size, 19);
    assert.deepEqual(expanded.objects, baseline.objects, "Expanding moved objects");
    assert.equal(surfaceAt(expanded, { x: -2, z: 5 }), "grass");
    await screenshot(page, `${viewport.name}-19`);
    await layoutAndPixels(page);

    if (viewport.name === "desktop") {
      // Every model is added through its real palette entry, including offscreen items.
      for (const [group, section, label, kind, x, z] of additions) {
        await button(page, group).click();
        await sectionTab(page, section).click();
        await button(page, label).click();
        const point = project(viewport, expanded, x, z);
        await page.mouse.click(point.x, point.y);
        const rotation = page.getByRole("slider", { name: "物件旋转" });
        await rotation.focus();
        await rotation.press("ArrowRight");
        const scale = page.getByRole("slider", { name: "物件缩放" });
        await scale.focus();
        await scale.press("ArrowRight");
        expanded = await save(page);
        const item = expanded.objects.at(-1);
        assert.equal(item.kind, kind);
        assert.ok(Math.hypot(item.x - x, item.z - z) < 0.025, `${kind} misplaced`);
        assert.ok(item.rotation > 0 && item.scale > 1, `${kind} transform failed`);
        await page.mouse.move(5, 5);
        const clip = { x: Math.max(0, point.x - 65), y: Math.max(0, point.y - 95), width: 130, height: 120 };
        await page.screenshot({ path: new URL(`object-${kind}.png`, output).pathname, clip });
      }
      assert.equal(expanded.objects.length, baseline.objects.length + additions.length);
      await button(page, "光景设置").click();
      await button(page, "春").click();
      await button(page, "关闭光景设置").click();
      await button(page, "旋转视角").click();
      await screenshot(page, "all-new-elements");
      console.log("desktop: all ten objects placed and transformed");

      // Editing in the area outside the former 11-unit boundary must work.
      await button(page, "地面").click();
      await button(page, "白砂").click();
      await drag(page, project(viewport, expanded, -2.5, 9), project(viewport, expanded, -1.3, 9));
      expanded = await save(page);
      assert.equal(surfaceAt(expanded, { x: -2, z: 9 }), "sand");
      await button(page, "砂纹").click();
      const marks = expanded.marks.length;
      await drag(page, project(viewport, expanded, -2.4, 9), project(viewport, expanded, -1.4, 9));
      expanded = await save(page);
      assert.equal(expanded.marks.length, marks + 1);
      await button(page, "地形").click();
      await button(page, "抬高").click();
      const at = project(viewport, expanded, -2.3, 5.3);
      const oldHeight = heightAt(expanded, { x: -2.3, z: 5.3 });
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.waitForTimeout(800);
      await page.mouse.up();
      expanded = await save(page);
      assert.ok(heightAt(expanded, { x: -2.3, z: 5.3 }) > oldHeight + 0.1);
    } else {
      await button(page, "构筑").click();
      await sectionTab(page, "建筑").click();
      await button(page, "茶亭").click();
      const point = project(viewport, expanded, -1, 8);
      await page.touchscreen.tap(point.x, point.y);
      expanded = await save(page);
      assert.equal(expanded.objects.at(-1).kind, "pavilion");
      assert.ok(expanded.objects.at(-1).x < 0, "Touch placement used old bounds");
    }

    const dialog = await chooseSize(page, 7, false);
    assert.match(await dialog.innerText(), /物品将移回院内/);
    await screenshot(page, `${viewport.name}-shrink-confirm`);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    await button(page, "取消尺寸调整").click();
    assert.deepEqual(await save(page), expanded, "Cancel resized the garden");
    await chooseSize(page, 7);
    const shrunk = await save(page);
    assert.equal(shrunk.size, 7);
    assert.equal(shrunk.objects.length, expanded.objects.length);
    assert.ok(shrunk.objects.every((item) => inGarden(item, 7)));
    const pavilion = shrunk.objects.find((item) => item.kind === "pavilion");
    assert.ok(pavilion && pavilion.x > 3 && pavilion.x < 7 && pavilion.z > 3 && pavilion.z < 7,
      "Large object footprint extends beyond the resized garden");
    assert.deepEqual(shrunk.objects.map((o) => o.scale), expanded.objects.map((o) => o.scale));
    assert.ok(shrunk.marks.every((mark) => mark.clip?.min === 1.5 && mark.clip?.max === 8.5));
    await screenshot(page, `${viewport.name}-7`);
    const metrics = await layoutAndPixels(page);
    await button(page, "撤销").click();
    assert.deepEqual(await save(page), expanded, "Resize undo changed the previous garden");
    await button(page, "重做").click();
    assert.deepEqual(await save(page), shrunk, "Resize redo differs");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await save(page), shrunk, "Reload lost resized garden");
    await chooseSize(page, 19);
    const regrown = await save(page);
    assert.deepEqual(regrown.marks, shrunk.marks, "Expanding lost rake clipping bounds");
    assert.deepEqual(errors, [], "Browser errors");
    results.push({ viewport: viewport.name, status: "passed", ...metrics });
    await context.close();
    console.log(`${viewport.name}: passed`);
  }

  const migration = await browser.newContext({ reducedMotion: "reduce" });
  await migration.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: PREVIOUS_SAVE_KEY, data: previous });
  await suppressOnboarding(migration);
  const page = await migration.newPage();
  await page.goto(process.env.BASE_URL ?? "http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  assert.deepEqual(await save(page), initial);
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PREVIOUS_SAVE_KEY), previous);
  await migration.close();
  results.push({ name: "all-supported-sizes-and-v2-migration", status: "passed" });
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
