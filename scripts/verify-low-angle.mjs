import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createInitialGarden, resizeGarden, SAVE_KEY } from "../src/game/model.ts";

const inspect = process.argv.includes("--inspect");
const output = new URL("../artifacts/low-angle/", import.meta.url);
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
const results = [];

async function metrics(page, selector = ".editor-scene canvas") {
  return page.evaluate(async (selector) => {
    // Read the live R3F camera without adding instrumentation to application code.
    const { _roots } = await import("/node_modules/.vite/deps/@react-three_fiber.js");
    const canvas = document.querySelector(selector);
    const { camera, controls, scene } = _roots.get(canvas).store.getState();
    const base = scene.getObjectByName("garden-foundation");
    const plinth = scene.getObjectByName("garden-plinth");
    const { width, depth, height } = base.geometry.parameters;
    const plinthSize = plinth.geometry.parameters;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => {
      const point = camera.position.clone().set(x * width / 2, height / 2, z * depth / 2);
      base.localToWorld(point).project(camera);
      return { x: (point.x + 1) * canvas.clientWidth / 2, y: (1 - point.y) * canvas.clientHeight / 2 };
    });
    const sample = new OffscreenCanvas(80, 80), ctx = sample.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 80, 80);
    const { data } = ctx.getImageData(0, 0, 80, 80), colors = new Set();
    for (let i = 0; i < data.length; i += 16) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    const terrain = scene.getObjectByName("garden-terrain").geometry.attributes.position;
    const last = terrain.count - 1;
    return {
      camera: camera.type,
      elevation: 90 - controls.getPolarAngle() * 180 / Math.PI,
      azimuth: controls.getAzimuthalAngle(),
      zoom: camera.zoom,
      base: { width, depth },
      plinth: { width: plinthSize.width, depth: plinthSize.depth },
      terrain: { width: terrain.getX(last) - terrain.getX(0), depth: terrain.getZ(last) - terrain.getZ(0) },
      corners, colors: colors.size,
      viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
    };
  }, selector);
}

function checkFrame(result, minimumElevation) {
  assert.equal(result.camera, "OrthographicCamera");
  assert.equal(result.base.width, result.base.depth);
  assert.deepEqual(result.plinth, result.base);
  assert.ok(Math.abs(result.terrain.width - result.terrain.depth) < 0.00001);
  assert.ok(result.elevation >= minimumElevation - 0.05, `View collapsed to ${result.elevation} degrees`);
  assert.ok(result.colors > 8, "Canvas is blank");
  const edges = result.corners.map((point, index) => {
    const next = result.corners[(index + 1) % 4];
    return { x: next.x - point.x, y: next.y - point.y };
  });
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.hypot(edges[i].x + edges[i + 2].x, edges[i].y + edges[i + 2].y) < 0.01,
      "Opposite edges are not equal and parallel");
  }
  for (const point of result.corners) {
    assert.ok(point.x > 0 && point.x < result.viewport.width && point.y > 0 && point.y < result.viewport.height,
      `Base outside viewport: ${JSON.stringify(point)}`);
  }
}

async function settle(page, top = false) {
  await page.evaluate(async (top) => {
    const { _roots } = await import("/node_modules/.vite/deps/@react-three_fiber.js");
    const canvas = document.querySelector(".editor-scene canvas");
    const controls = _roots.get(canvas)?.store.getState().controls;
    if (!controls) throw new Error("Missing camera controls");
    const deadline = performance.now() + 10000;
    await new Promise((resolve, reject) => {
      const check = () => {
        const atAngle = Math.abs(controls.getPolarAngle() - (top ? 0 : controls.maxPolarAngle)) < 0.0001;
        if (atAngle) { resolve(); return; }
        if (performance.now() > deadline) {
          reject(new Error(`Camera did not settle: ${JSON.stringify({
            polar: controls.getPolarAngle(), expected: top ? 0 : controls.maxPolarAngle,
          })}`));
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, top);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function dragToLow(page, viewport) {
  await page.mouse.move(viewport.width / 2, viewport.height * 0.58);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(viewport.width / 2 + viewport.height / 4, viewport.height * 0.25, { steps: 8 });
  await page.mouse.up({ button: "left" });
  await settle(page);
}

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 960 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 640 },
  ].filter((viewport) => !inspect || viewport.name === "desktop")) {
    for (const size of inspect ? [19] : [7, 15, 19]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 720, reducedMotion: "reduce" });
      const fixture = resizeGarden(createInitialGarden(), size);
      await context.addInitScript(({ key, garden }) => localStorage.setItem(key, JSON.stringify(garden)),
        { key: SAVE_KEY, garden: fixture });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: "networkidle" });
      await page.waitForFunction(() => (document.querySelector("canvas")?.toDataURL().length ?? 0) > 18000);
      await button(page, "保存庭院").click();
      const baseline = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
      await dragToLow(page, viewport);
      const views = [];
      for (let side = 0; side < 4; side++) {
        const result = await metrics(page);
        checkFrame(result, 15);
        views.push(result);
        await page.mouse.move(1, 1);
        await page.screenshot({ path: new URL(`${inspect ? "before" : "after"}-${viewport.name}-${size}-side-${side}.png`, output).pathname });
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.down({ button: "left" });
        await page.mouse.move(viewport.width / 2 + viewport.height / 2, viewport.height / 2 - 10, { steps: 8 });
        await page.mouse.up({ button: "left" });
        await settle(page);
      }
      if (!inspect && viewport.width < 720) {
        await button(page, "复位视角").click();
        const cdp = await context.newCDPSession(page);
        const x = viewport.width / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: viewport.height * 0.55, id: 1 }] });
        for (let i = 1; i <= 8; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: viewport.height * (0.55 - i * 0.035), id: 1 }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await settle(page);
        checkFrame(await metrics(page), 15);
        await cdp.detach();
      }
      await button(page, "正俯视").click();
      await settle(page, true);
      const top = await metrics(page);
      checkFrame(top, 89.9);
      const a = top.corners[0], b = top.corners[1], c = top.corners[2];
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(c.x - b.x, c.y - b.y)) < 0.01);
      await button(page, "保存庭院").click();
      assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY), baseline,
        "Camera navigation changed the garden");
      assert.equal(await button(page, "撤销").isEnabled(), false);
      assert.deepEqual(errors, []);
      results.push({ viewport: viewport.name, size, status: "passed", views, top });
      console.log(`${viewport.name} ${size}: low-angle four-side framing, top view and save isolation passed`);
      await context.close();
    }
  }
  await writeFile(new URL(inspect ? "before.json" : "results.json", output), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
