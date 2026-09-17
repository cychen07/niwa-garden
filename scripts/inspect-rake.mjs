import { chromium } from "playwright-core";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { inflateSync } from "node:zlib";
import assert from "node:assert/strict";
import { OrthographicCamera, Vector3 } from "three";
import { cameraFrame, CAMERA_TARGET, DEFAULT_CAMERA_POSITION } from "../src/game/camera.ts";
import { createInitialGarden, applyBrush, SAVE_KEY } from "../src/game/model.ts";
import { suppressOnboarding } from "./onboarding-test.mjs";

const slowOnly = process.argv.includes("--slow-only");
const output = new URL(slowOnly ? "../artifacts/rake-slow-fix/" : "../artifacts/rake-inspection/", import.meta.url);
await mkdir(output, { recursive: true });
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const names = (await readdir(cache)).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = names.map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell")).find(existsSync);
}
const browser = await chromium.launch({
  headless: true, ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const button = (page, name) => page.getByRole("button", { name, exact: true });
const report = { scenarios: [], sampling: {} };
const errors = [];

function project(viewport, x, z, zoomFactor = 1) {
  const { width: w, height: h } = viewport;
  const camera = new OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100);
  const { zoom, offsetY } = cameraFrame(w, h, 11);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(...CAMERA_TARGET);
  camera.zoom = zoom * zoomFactor;
  camera.setViewOffset(w, h, 0, offsetY, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new Vector3(x - 5, 0.16, z - 5).project(camera);
  return { x: (point.x + 1) * w / 2, y: (1 - point.y) * h / 2 };
}

async function prepare(viewport, surface = "sand") {
  const seed = createInitialGarden();
  seed.objects = [];
  seed.marks = [];
  seed.terrain.heights.fill(0.16);
  seed.terrain.surfaces.fill(surface);
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.width < 720 });
  await suppressOnboarding(context);
  // A fresh browser context keeps inspection fixtures separate from user gardens.
  await context.addInitScript(({ key, seed }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: SAVE_KEY, seed });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (document.querySelector("canvas")?.toDataURL().length ?? 0) > 12000);
  await button(page, "光景设置").click();
  await button(page, "夏").click();
  await button(page, "关闭光景设置").click();
  if (viewport.width < 720) await button(page, "地面").click();
  await button(page, "砂纹").click();
  await page.waitForTimeout(200);
  return { context, page, seed };
}

async function stroke(page, viewport, points, steps = 4, pause = 0, zoom = 1) {
  const start = project(viewport, ...points[0], zoom);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, z] of points.slice(1)) {
    const at = project(viewport, x, z, zoom);
    await page.mouse.move(at.x, at.y, { steps });
    if (pause) await page.waitForTimeout(pause);
  }
  await page.mouse.up();
}

async function capture(page, name) {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname });
  const sample = await page.evaluate(async () => {
    const source = document.querySelector("canvas");
    const bitmap = await createImageBitmap(source);
    const target = new OffscreenCanvas(source.width, source.height);
    const ctx = target.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, target.width, target.height).data;
    const compressed = new Uint8Array(await new Response(
      new Blob([pixels]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer());
    let binary = "";
    for (let i = 0; i < compressed.length; i += 8192) {
      binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
    }
    return { encoded: btoa(binary), width: target.width, height: target.height };
  });
  console.log(`Captured ${name}`);
  return { ...sample, pixels: inflateSync(Buffer.from(sample.encoded, "base64")) };
}

function pixelDifference(before, after, region = null) {
  let changed = 0, total = 0, maximum = 0;
  const box = region ?? { x: 0, y: 0, width: before.width, height: before.height };
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(before.height, box.y + box.height); y += 1) {
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(before.width, box.x + box.width); x += 1) {
      const i = (y * before.width + x) * 4;
      const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(before.pixels[i + channel] - after.pixels[i + channel])));
      if (delta > 2) changed += 1;
      maximum = Math.max(maximum, delta);
      total += 1;
    }
  }
  return { changed, total, maximum };
}

async function save(page) {
  await button(page, "保存庭院").click();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
}

function assertPoint(actual, expected, tolerance = 0.0001) {
  assert.ok(actual && Math.hypot(actual.x - expected[0], actual.z - expected[1]) < tolerance,
    `Expected point ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

try {
  const viewport = { width: 1440, height: 960 };
  if (!slowOnly) {
    const { context, page, seed } = await prepare(viewport);
    const before = await capture(page, "01-blank");
    await stroke(page, viewport, [[2, 2], [8, 2]], 30);
    const straight = await capture(page, "02-straight");
    const straightState = await save(page);
    await button(page, "撤销").click();
    const undone = await capture(page, "03-undone");
    await button(page, "重做").click();
    const redone = await capture(page, "04-redone");
    const diff = pixelDifference(before, straight);
    report.scenarios.push({ name: "straight-and-visual-history", marks: straightState.marks.length,
      points: straightState.marks.at(-1)?.points.length, diff,
      undoPixels: pixelDifference(before, undone), redoPixels: pixelDifference(straight, redone) });

    await stroke(page, viewport, [[5, 0.7], [5, 3.5]], 18);
    await capture(page, "05-crossing");
    const crossed = await save(page);
    report.scenarios.push({ name: "crossing", marks: crossed.marks.length });
    await button(page, "撤销").click();

    // Reapplying sand with a stationary dab should clear grooves at that point.
    await button(page, "白砂").click();
    const dab = project(viewport, 5, 2);
    await page.mouse.click(dab.x, dab.y);
    const dabbed = await capture(page, "06-repaint-dab");
    const dabbedState = await save(page);
    report.scenarios.push({ name: "stationary-repaint", lastMark: dabbedState.marks.at(-1),
      pixels: pixelDifference(straight, dabbed), surfacesUnchanged: JSON.stringify(dabbedState.terrain.surfaces) === JSON.stringify(seed.terrain.surfaces) });
    await stroke(page, viewport, [[3, 2], [6, 2]], 20);
    const cleared = await capture(page, "07-repaint-drag");
    report.scenarios.push({ name: "drag-repaint", pixels: pixelDifference(dabbed, cleared) });
    await context.close();
  }
  if (!slowOnly) {
    const { context, page } = await prepare(viewport);
    const brush = page.getByRole("slider", { name: "画笔直径" });
    await brush.focus();
    await brush.press("End");
    await stroke(page, viewport, [[3, 3], [4, 3], [5, 3], [5.5, 3.15], [5.7, 3.5], [5.5, 3.85], [5, 4], [4, 4], [3, 4]], 6);
    await capture(page, "08-wide-hairpin");
    report.scenarios.push({ name: "wide-hairpin", marks: (await save(page)).marks.length });
    await context.close();
  }
  {
    const { context, page, seed } = await prepare(viewport);
    const before = await capture(page, "09-slow-blank");
    const points = Array.from({ length: 81 }, (_, i) => [4 + i * 0.012, 6]);
    points.push([4.963, 6]);
    for (let i = 0; i < 6; i += 1) await button(page, "放大视角").click();
    await stroke(page, viewport, points, 1, 35, 1.2 ** 6);
    await capture(page, "10-slow-zoomed");
    const state = await save(page);
    if (slowOnly) {
      assert.equal(state.marks.length, 1, "Slow dragging did not create one continuous stroke");
      assert.ok(state.marks[0].points.length > 20, "Slow stroke has too few accepted samples");
      assertPoint(state.marks[0].points[0], points[0]);
      assertPoint(state.marks[0].points.at(-1), points.at(-1));
    }
    report.scenarios.push({ name: "slow-zoomed", marks: state.marks.length,
      points: state.marks.at(-1)?.points.length ?? 0, expectedStart: points[0], expectedEnd: points.at(-1),
      actualStart: state.marks.at(-1)?.points[0], actualEnd: state.marks.at(-1)?.points.at(-1) });
    await button(page, "复位视角").click();
    const after = await capture(page, "11-slow-reset-view");
    report.scenarios.at(-1).pixels = pixelDifference(before, after);
    if (slowOnly) {
      assert.ok(report.scenarios.at(-1).pixels.changed > 0, "Stroke is stored but not visible");
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), seed, "Undo did not restore the complete slow stroke");
      const undone = await capture(page, "15-slow-undone");
      assert.equal(pixelDifference(before, undone).changed, 0, "Undo left visible grooves");
      await button(page, "重做").click();
      assert.deepEqual(await save(page), state, "Redo did not restore the slow stroke");
      const redone = await capture(page, "16-slow-redone");
      assert.equal(pixelDifference(after, redone).changed, 0, "Redo changed the groove image");

      const at = project(viewport, 5, 6);
      await page.mouse.click(at.x, at.y);
      assert.deepEqual(await save(page), state, "A stationary click created a spurious stroke");
      await stroke(page, viewport, [[5, 6], [5.005, 6]], 1);
      const short = await save(page);
      assert.equal(short.marks.length, 2, "A short drag was lost at release");
      assertPoint(short.marks.at(-1).points[0], [5, 6]);
      assertPoint(short.marks.at(-1).points.at(-1), [5.005, 6]);

      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      const moved = project(viewport, 5.5, 6);
      await page.mouse.move(moved.x, moved.y, { steps: 10 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.deepEqual(await save(page), short, "Cancelled rake was committed");
      assert.equal(await button(page, "旋转视角").getAttribute("aria-pressed"), "true");

      // Leaving and re-entering the ground must not connect separate subpaths.
      await button(page, "地面").click();
      await button(page, "砂纹").click();
      await stroke(page, viewport, [[8, 6], [8.5, 6]], 2);
      const beforeReentry = await save(page);
      const from = project(viewport, 8, 5);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      const end = project(viewport, 8.3, 5);
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await page.mouse.move(1435, 500);
      const reentry = project(viewport, 2, 5);
      await page.mouse.move(reentry.x, reentry.y);
      const secondEnd = project(viewport, 2.303, 5);
      await page.mouse.move(secondEnd.x, secondEnd.y, { steps: 8 });
      await page.mouse.up();
      const reentered = await save(page);
      assert.equal(reentered.marks.length, beforeReentry.marks.length + 2);
      assertPoint(reentered.marks.at(-1).points[0], [2, 5]);
      assertPoint(reentered.marks.at(-1).points.at(-1), [2.303, 5]);
      await button(page, "撤销").click();
      assert.deepEqual(await save(page), beforeReentry, "Subpaths did not share one undo transaction");
      await page.reload({ waitUntil: "networkidle" });
      assert.deepEqual(await save(page), beforeReentry, "Reload changed saved rake points");
      report.scenarios.push({ name: "short-drag-click-cancel-reentry-history-reload", status: "passed" });
    }
    await context.close();
  }
  if (!slowOnly) {
    const { context, page } = await prepare(viewport, "grass");
    const before = await capture(page, "12-grass-blank");
    await stroke(page, viewport, [[2, 5], [8, 5]], 25);
    const after = await capture(page, "13-grass-raked");
    report.scenarios.push({ name: "non-sand-clipping", pixels: pixelDifference(before, after), recordedMarks: (await save(page)).marks.length });
    await context.close();
  }
  if (!slowOnly) {
    const mobile = { width: 390, height: 844 };
    const { context, page } = await prepare(mobile);
    await stroke(page, mobile, [[2, 3], [3, 4], [3.4, 5], [4, 6], [6, 7]], 8);
    await capture(page, "14-mobile-curve");
    report.scenarios.push({ name: "mobile-curve", points: (await save(page)).marks.at(-1)?.points.length });
    await context.close();
  }
  if (slowOnly) {
    const mobile = { width: 390, height: 844 };
    const { context, page, seed } = await prepare(mobile);
    const session = await context.newCDPSession(page);
    const points = Array.from({ length: 81 }, (_, i) => [4 + i * 0.012, 6]);
    points.push([4.963, 6]);
    const start = project(mobile, ...points[0]);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
    for (const point of points.slice(1)) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ ...project(mobile, ...point), id: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const state = await save(page);
    assert.equal(state.marks.length, 1, "Native touch slow drag failed");
    assertPoint(state.marks[0].points[0], points[0], 0.06);
    assertPoint(state.marks[0].points.at(-1), points.at(-1), 0.06);
    await capture(page, "17-mobile-slow-drag");
    await button(page, "撤销").click();
    assert.deepEqual(await save(page), seed, "Touch slow drag undo failed");
    report.scenarios.push({ name: "native-touch-slow-drag", status: "passed", points: state.marks[0].points.length });
    await session.detach();
    await context.close();
  }
  // Reproduce the input pipeline's distance filtering with sub-threshold samples.
  let garden = createInitialGarden();
  garden.marks = [];
  let last = { x: 2, z: 5 };
  for (let i = 1; i <= 100; i += 1) {
    const to = { x: 2 + i * 0.012, z: 5 };
    const next = applyBrush(garden, last, to, { kind: "rake" }, 1.2, 0.04, "slow");
    if (next !== garden) last = to;
    garden = next;
  }
  garden = applyBrush(garden, last, { x: 3.203, z: 5 }, { kind: "rake" }, 1.2, 0.04, "slow", true);
  report.sampling = { inputDistance: 1.2, perEventDistance: 0.012, recordedMarks: garden.marks.length };
  if (slowOnly) {
    assert.equal(garden.marks.length, 1);
    assertPoint(garden.marks[0].points[0], [2, 5]);
    assertPoint(garden.marks[0].points.at(-1), [3.203, 5]);
    assert.deepEqual(errors, [], "Browser runtime errors");
  }
  await writeFile(new URL("results.json", output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
