import { chromium } from "playwright-core";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { OrthographicCamera, Vector3 } from "three";
import { cameraFrame, CAMERA_TARGET, DEFAULT_CAMERA_POSITION } from "../src/game/camera.ts";
import { createInitialGarden, heightAt, surfaceAt, parseGarden, applyBrush, GRID_SIDE, SAVE_KEY, LEGACY_SAVE_KEY } from "../src/game/model.ts";
import { suppressOnboarding } from "./onboarding-test.mjs";

const outputDir = new URL("../artifacts/", import.meta.url);
await mkdir(outputDir, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = builds.map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell"))
    .find(existsSync);
}
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const results = [];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const save = async (page) => {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
};
const shot = (page, name) => page.screenshot({ path: new URL(`${name}.png`, outputDir).pathname });

function screen(viewport, garden, x, z, extraHeight = 0) {
  const { width: w, height: h } = viewport;
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100);
  const { zoom, offsetY } = cameraFrame(w, h, garden.size);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(...CAMERA_TARGET);
  camera.zoom = zoom;
  camera.setViewOffset(w, h, 0, offsetY, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(x - 5, heightAt(garden, { x, z }) + extraHeight, z - 5).project(camera);
  return { x: (point.x + 1) * w / 2, y: (1 - point.y) * h / 2 };
}

async function drag(page, from, to, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function checkPixelsAndLayout(page) {
  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const colors = new Set();
    const pixel = new Uint8Array(4);
    if (gl) {
      for (let y = 1; y < 16; y += 1) for (let x = 1; x < 16; x += 1) {
        gl.readPixels(Math.floor(canvas.width * x / 16), Math.floor(canvas.height * y / 16), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colors.add(Array.from(pixel).join(","));
      }
    }
    const rects = [".brand-lockup", ".project-controls", ".top-actions", ".tool-rail", ".catalog-panel", ".view-tools", ".tool-settings", ".environment-trigger", ".toast.show", ".creation-nav"]
      .flatMap((selector) => {
        const node = document.querySelector(selector);
        if (!node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") return [];
        const rect = node.getBoundingClientRect();
        return rect.width && rect.height ? [{ selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }] : [];
      });
    const overflow = rects.filter((r) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1);
    const overlaps = rects.flatMap((a, i) => rects.slice(i + 1).filter((b) =>
      a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)
      .map((b) => `${a.selector} / ${b.selector}`));
    return { colors: colors.size, overflow, overlaps, viewport: [innerWidth, innerHeight] };
  });
  assert.ok(metrics.colors > 8, `Blank canvas: ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.overflow, [], "Controls extend outside viewport");
  assert.deepEqual(metrics.overlaps, [], "Controls overlap");
  return metrics;
}

try {
  // Verify continuous fields and strict migration without touching the user's save.
  const original = createInitialGarden();
  const small = applyBrush(original, { x: 5, z: 8 }, { x: 5, z: 8 }, { kind: "surface", value: "sand" }, 0.4, 0.04, "small");
  const large = applyBrush(original, { x: 5, z: 8 }, { x: 5, z: 8 }, { kind: "surface", value: "sand" }, 3, 0.04, "large");
  const paintedCount = (state) => state.terrain.surfaces.filter((s, i) => s !== original.terrain.surfaces[i]).length;
  assert.ok(paintedCount(large) > paintedCount(small) * 5);
  assert.equal(parseGarden({ ...original, terrain: { ...original.terrain, heights: [NaN] } }), null);
  assert.deepEqual(parseGarden(original), original);

  // Static terrain makes pixel changes attributable to camera input, not water or leaves.
  {
    const fixture = createInitialGarden();
    fixture.objects = [];
    fixture.marks = [];
    fixture.terrain.surfaces.fill("grass");
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
    await context.addInitScript(({ key, garden }) => localStorage.setItem(key, JSON.stringify(garden)),
      { key: SAVE_KEY, garden: fixture });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await button(page, "光景设置").click();
    await button(page, "夏").click();
    await button(page, "关闭光景设置").click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return false;
      const sample = new OffscreenCanvas(64, 64), ctx = sample.getContext("2d");
      ctx.drawImage(canvas, 0, 0, 64, 64);
      const { data } = ctx.getImageData(0, 0, 64, 64), colors = new Set();
      for (let i = 0; i < data.length; i += 16) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return colors.size > 8;
    });
    assert.equal(await button(page, "旋转视角").getAttribute("aria-pressed"), "true");
    const baseline = await save(page);
    const canvas = page.locator(".editor-scene canvas");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const frame = () => canvas.evaluate((node) => node.toDataURL());
    const before = await frame();
    await shot(page, "left-drag-before");
    await page.mouse.move(720, 500);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(860, 530, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await shot(page, "left-drag-right-check");
    assert.ok(await frame() === before, "Right drag changed the static scene");
    assert.deepEqual(await save(page), baseline, "Right drag edited terrain");

    await page.mouse.move(720, 500);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(860, 530, { steps: 8 });
    assert.ok(await frame() !== before, "Default left drag did not rotate while held");
    await shot(page, "left-drag-orbit");
    await page.mouse.move(1460, 500);
    await page.mouse.up({ button: "left" });
    assert.deepEqual(await save(page), baseline, "View drag changed the garden");
    assert.equal(await button(page, "撤销").isEnabled(), false, "View drag created an undo entry");
    await button(page, "复位视角").click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await frame() === before, "Reset did not restore the initial camera");
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, -200);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await frame() !== before, "Wheel zoom stopped working");
    assert.deepEqual(await save(page), baseline);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await button(page, "旋转视角").getAttribute("aria-pressed"), "true", "Reload did not restore view mode");
    assert.deepEqual(await save(page), baseline);
    await context.close();
    results.push({ name: "default-left-drag-right-disabled-wheel-reload", status: "passed" });
    console.log("default left drag, right-button isolation and wheel zoom passed");
  }

  for (const viewport of [
    { name: "desktop", width: 1440, height: 960 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 640 },
  ]) {
    console.log(`${viewport.name}: starting`);
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.name !== "desktop", isMobile: viewport.name !== "desktop" });
    await suppressOnboarding(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (document.querySelector("canvas")?.toDataURL().length ?? 0) > 20000);
    await page.waitForTimeout(300);
    console.log(`${viewport.name}: scene ready`);
    await shot(page, `building-${viewport.name}`);
    const metrics = await checkPixelsAndLayout(page);
    const baseline = await save(page);
    assert.equal(baseline.terrain.heights.length, GRID_SIDE ** 2);

    if (viewport.name === "desktop") {
      // A fast stroke must have no holes and one undo must remove all of it.
      await button(page, "苔藓").click();
      await drag(page, screen(viewport, baseline, 1.5, 7), screen(viewport, baseline, 6, 7), 2);
      const painted = await save(page);
      for (let x = 1.7; x < 5.9; x += 0.2) assert.equal(surfaceAt(painted, { x, z: 7 }), "moss", `Paint gap at ${x}`);
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), baseline, "Undo did not restore whole stroke");
      await button(page, "重做").click();
      assert.deepEqual(await save(page), painted, "Redo differs");
      console.log("desktop: paint and history passed");

      // Hold to sculpt, then smooth and lower without camera motion.
      await button(page, "地形").click();
      await button(page, "抬高").click();
      const center = screen(viewport, painted, 5, 6);
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.waitForTimeout(900);
      await page.mouse.up();
      const raised = await save(page);
      assert.ok(heightAt(raised, { x: 5, z: 6 }) > heightAt(painted, { x: 5, z: 6 }) + 0.2, "Hold sculpt failed");
      await button(page, "平滑").click();
      const top = screen(viewport, raised, 5, 6);
      await page.mouse.move(top.x, top.y);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      const smoothed = await save(page);
      assert.ok(heightAt(smoothed, { x: 5, z: 6 }) < heightAt(raised, { x: 5, z: 6 }),
        `Smooth did not lower peak: ${JSON.stringify({
          before: heightAt(raised, { x: 5, z: 6 }), after: heightAt(smoothed, { x: 5, z: 6 }),
          changedSamples: smoothed.terrain.heights.filter((h, i) => h !== raised.terrain.heights[i]).length,
        })}`);
      await button(page, "降低").click();
      const peak = screen(viewport, smoothed, 5, 6);
      await page.mouse.move(peak.x, peak.y);
      await page.mouse.down();
      await page.waitForTimeout(500);
      await page.mouse.up();
      const lowered = await save(page);
      assert.ok(heightAt(lowered, { x: 5, z: 6 }) < heightAt(smoothed, { x: 5, z: 6 }));
      console.log("desktop: sculpt passed");

      // Rake a curve and preserve every part through undo/redo and serialization.
      await button(page, "地面").click();
      await button(page, "砂纹").click();
      const start = screen(viewport, lowered, 1, 4);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (const [x, z] of [[1.3, 4.5], [1.8, 5], [2.4, 5.7], [2.5, 6.4]]) {
        const point = screen(viewport, lowered, x, z);
        await page.mouse.move(point.x, point.y, { steps: 6 });
      }
      await page.mouse.up();
      const raked = await save(page);
      assert.equal(raked.marks.length, lowered.marks.length + 1);
      assert.ok(raked.marks.at(-1).points.length >= 8, "Rake path lost curve samples");
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), lowered);
      await button(page, "重做").click();
      assert.deepEqual(await save(page), raked);
      console.log("desktop: rake passed");

      // Free placement must neither replace another object nor snap to a cell.
      await button(page, "摆件").click();
      await page.getByRole("tab", { name: "灯饰", exact: true }).click();
      await button(page, "石灯笼").click();
      const target = screen(viewport, raked, 4.3, 8.3);
      await page.mouse.move(target.x, target.y);
      await shot(page, "building-placement-preview");
      await page.mouse.click(target.x, target.y);
      const placed = await save(page);
      assert.equal(placed.objects.length, raked.objects.length + 1);
      const item = placed.objects.at(-1);
      assert.ok(Math.abs(item.x - 4.3) < 0.1 && Math.abs(item.z - 8.3) < 0.1);
      assert.equal(await button(page, "选取与移动").getAttribute("aria-pressed"), "true");
      const dragFrom = screen(viewport, placed, item.x, item.z, 0.5);
      await drag(page, dragFrom, { x: dragFrom.x + 60, y: dragFrom.y - 15 });
      const moved = await save(page);
      assert.ok(Math.hypot(moved.objects.at(-1).x - item.x, moved.objects.at(-1).z - item.z) > 0.3, "Object did not move");
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), placed, "Object drag not atomic");
      await button(page, "重做").click();
      assert.deepEqual(await save(page), moved);
      console.log("desktop: place and move passed");

      // Native slider keyboard interactions must also form a single transaction.
      const rotation = page.getByRole("slider", { name: "物件旋转" });
      await rotation.focus();
      await page.keyboard.down("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("ArrowRight");
      const rotated = await save(page);
      assert.ok(rotated.objects.at(-1).rotation > moved.objects.at(-1).rotation);
      const scale = page.getByRole("slider", { name: "物件缩放" });
      const bounds = await scale.boundingBox();
      await drag(page, { x: bounds.x + bounds.width * 0.4, y: bounds.y + bounds.height / 2 },
        { x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height / 2 });
      const scaled = await save(page);
      assert.ok(scaled.objects.at(-1).scale > rotated.objects.at(-1).scale);
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), rotated, "Slider drag not atomic");
      await button(page, "重做").click();
      assert.deepEqual(await save(page), scaled);
      await shot(page, "building-edited");
      await checkPixelsAndLayout(page);

      await button(page, "删除选中物件").click();
      assert.equal((await save(page)).objects.length, raked.objects.length);
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), scaled);

      // Escape cancels painting; release outside must not leave a brush active.
      await button(page, "地面").click();
      await button(page, "苔藓").click();
      const cancelAt = screen(viewport, scaled, 6, 9);
      await page.mouse.move(cancelAt.x, cancelAt.y);
      await page.mouse.down();
      await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.deepEqual(await save(page), scaled, "Escape did not cancel");
      assert.equal(await button(page, "旋转视角").getAttribute("aria-pressed"), "true", "Escape did not return to view mode");
      await button(page, "地面").click();
      await button(page, "苔藓").click();
      await drag(page, cancelAt, { x: 1420, y: 600 });
      const released = await save(page);
      const hoverAt = screen(viewport, released, 5, 8);
      await page.mouse.move(hoverAt.x, hoverAt.y);
      await page.waitForTimeout(250);
      assert.deepEqual(await save(page), released, "Painting stuck after release");

      // Camera navigation must not edit the garden; image export must work.
      await button(page, "旋转视角").click();
      const beforeCamera = await page.locator("canvas").screenshot();
      await drag(page, { x: 720, y: 500 }, { x: 900, y: 520 });
      await page.waitForTimeout(400);
      assert.notDeepEqual(await page.locator("canvas").screenshot(), beforeCamera);
      assert.deepEqual(await save(page), released);
      await button(page, "复位视角").click();
      const downloadPromise = page.waitForEvent("download");
      await button(page, "导出图片").click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.png$/);
      await page.reload({ waitUntil: "networkidle" });
      assert.deepEqual(await save(page), released, "Reload lost edits");

      await button(page, "光景设置").click();
      await button(page, "雪").click();
      await button(page, "冬").click();
      await button(page, "关闭光景设置").click();
      const firstFrame = await page.locator("canvas").screenshot();
      await page.waitForTimeout(300);
      assert.notDeepEqual(await page.locator("canvas").screenshot(), firstFrame, "Weather is not animated");
      await shot(page, "building-winter");
    } else {
      // Native touch events, not mouse emulation, for mobile painting.
      await button(page, "地面").click();
      await button(page, "苔藓").click();
      const cdp = await context.newCDPSession(page);
      const start = screen(viewport, baseline, 2, 7);
      const end = screen(viewport, baseline, 6, 7);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
      for (let step = 1; step <= 12; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
          x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12, id: 1,
        }] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const painted = await save(page);
      assert.ok(painted.terrain.surfaces.some((surface, i) => surface !== baseline.terrain.surfaces[i]), "Touch drag did not paint");
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), baseline, "Touch undo did not restore gesture");

      // Adding a second finger cancels paint and transfers control to pinch zoom.
      const beforePinch = await page.locator("canvas").screenshot();
      const second = { x: start.x + 60, y: start.y, id: 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }, second] });
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
          { x: start.x - step * 3, y: start.y, id: 1 }, { ...second, x: second.x + step * 3 },
        ] });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.deepEqual(await save(page), baseline, "Pinch left accidental brush marks");
      assert.notDeepEqual(await page.locator("canvas").screenshot(), beforePinch);
      await button(page, "复位视角").click();
      await button(page, "植栽").click();
      await button(page, "枫").click();
      const at = screen(viewport, baseline, 4, 7);
      await page.touchscreen.tap(at.x, at.y);
      assert.equal((await save(page)).objects.length, baseline.objects.length + 1, "Touch placement failed");
      await shot(page, `building-${viewport.name}-selected`);
      await checkPixelsAndLayout(page);
      await cdp.detach();
    }
    assert.deepEqual(errors, [], `${viewport.name} browser errors`);
    results.push({ name: viewport.name, status: "passed", ...metrics, errors });
    console.log(`${viewport.name}: passed`);
    await context.close();
  }

  const legacy = {
    tiles: Array.from({ length: 121 }, (_, i) => ({ x: i % 11, z: Math.floor(i / 11), height: i % 3, surface: i % 2 ? "sand" : "moss", rake: i % 4 })),
    objects: original.objects,
  };
  const migrated = parseGarden(legacy);
  assert.ok(migrated);
  const context = await browser.newContext();
  await context.addInitScript(({ key, data }) => { localStorage.setItem(key, JSON.stringify(data)); }, { key: LEGACY_SAVE_KEY, data: legacy });
  await suppressOnboarding(context);
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.deepEqual(await save(page), migrated, "Legacy browser migration differs");
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LEGACY_SAVE_KEY), legacy, "Legacy save overwritten");
  await context.close();
  results.push({ name: "legacy-migration-and-brush-size", status: "passed" });
  await writeFile(new URL("building-verification.json", outputDir), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
