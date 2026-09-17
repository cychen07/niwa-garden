import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createCommunityServer } from "../server/app.mjs";
import { templates } from "../src/game/templates.ts";
import { OBJECT_KINDS, parseGarden, objectHeightAt, heightAt } from "../src/game/model.ts";

const output = resolve("artifacts/community");
await mkdir(output, { recursive: true });
const dbPath = join(output, `test-${Date.now()}.sqlite`);
let server = createCommunityServer({ dbPath });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address().port, baseURL = `http://127.0.0.1:${port}`;
let executablePath = process.env.CHROME_PATH;
if (!executablePath && process.platform === "darwin" && !existsSync(chromium.executablePath())) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const builds = (await readdir(cache)).filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
  executablePath = builds.map((name) => join(cache, name, `chrome-headless-shell-mac-${process.arch === "arm64" ? "arm64" : "x64"}`, "chrome-headless-shell")).find(existsSync);
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const errors = [];
const track = (page) => {
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
};
const snap = async (page, name) => {
  await page.mouse.move(5, 5);
  await page.screenshot({ path: join(output, `${name}.png`) });
};
async function canvasPixels(page, selector) {
  await page.waitForFunction((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas || canvas.width < 10) return false;
    // Do not claim the source WebGL context before Three.js configures it.
    const sample = new OffscreenCanvas(80, 80), ctx = sample.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 80, 80);
    const pixels = ctx.getImageData(0, 0, 80, 80).data, colors = new Set();
    for (let y = 8; y < 72; y += 4) for (let x = 8; x < 72; x += 4) {
      const i = (y * 80 + x) * 4;
      colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }
    return colors.size > 8;
  }, selector);
  const result = await page.locator(selector).evaluate((canvas) => {
    const gl = canvas.getContext("webgl2"), p = new Uint8Array(4), colors = new Set();
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) {
      gl.readPixels(Math.floor(canvas.width * x / 20), Math.floor(canvas.height * y / 20), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      colors.add(Array.from(p).join(","));
    }
    return colors.size;
  });
  assert.ok(result > 8, `Blank scene for ${selector}: ${result} colors`);
  return result;
}
async function layout(page) {
  const issues = await page.evaluate(() => {
    const selectors = document.querySelector("dialog.studio[open]")
      ? [".studio-header", ".studio-header nav", ".studio-header .icon-command"]
      : [".brand-lockup", ".project-controls", ".top-actions", ".view-tools", ".creation-nav", ".creation-clock", ".tool-rail", ".catalog-panel", ".tool-settings", ".environment-trigger"];
    const boxes = selectors.flatMap((s) => {
      const node = document.querySelector(s);
      if (!node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") return [];
      const r = node.getBoundingClientRect();
      return r && r.width && r.height ? [{ s, left: r.left, top: r.top, right: r.right, bottom: r.bottom }] : [];
    });
    const outside = boxes.filter((r) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map((r) => r.s);
    const overlap = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) =>
      !a.s.startsWith(".studio-header") && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).map((b) => `${a.s}/${b.s}`));
    return { outside, overlap };
  });
  assert.deepEqual(issues, { outside: [], overlap: [] });
}
const results = [];
try {
  assert.equal(OBJECT_KINDS.length, 37);
  assert.equal(templates.length, 4);
  for (const template of templates) {
    assert.ok(parseGarden(template.garden));
    assert.equal(template.modules.length, 3);
    for (const item of template.garden.objects.filter((item) => ["teatable", "cushion", "bonsai"].includes(item.kind))) {
      assert.ok(objectHeightAt(template.garden, item) > heightAt(template.garden, item) + 0.1,
        `Furniture ${item.id} was buried in the deck`);
    }
  }
  const alice = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const page = await alice.newPage(); track(page);
  await page.goto(baseURL, { waitUntil: "networkidle" });
  console.log("desktop: editor ready");
  await canvasPixels(page, ".editor-scene canvas");
  await layout(page);
  await snap(page, "editor");
  await button(page, "保存庭院").click();
  const baseline = await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3")));
  await button(page, "物品目录").click();
  await page.getByRole("tab", { name: "建筑", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索物品" }).fill("藤架");
  assert.equal(await page.locator(".object-tile").count(), 1);
  await button(page, "预览藤架").click();
  await canvasPixels(page, ".catalogue-detail canvas");
  await snap(page, "catalogue");
  await page.getByRole("textbox", { name: "搜索物品" }).fill("石板桥");
  await button(page, "预览石板桥").click();
  await canvasPixels(page, ".catalogue-detail canvas");
  await snap(page, "stone-bridge");
  await page.getByRole("textbox", { name: "搜索物品" }).fill("藤架");
  await button(page, "预览藤架").click();
  await button(page, "放置物品").click();
  await page.mouse.click(530, 550);
  await button(page, "保存庭院").click();
  let current = await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3")));
  assert.equal(current.objects.at(-1).kind, "pergola");
  await button(page, "撤销").click();
  await button(page, "保存庭院").click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3"))), baseline);
  await button(page, "庭院范例").click();
  assert.equal(await page.locator(".garden-card").count(), 4);
  await canvasPixels(page, ".garden-card:nth-child(1) canvas");
  await canvasPixels(page, ".garden-card:nth-child(2) canvas");
  await snap(page, "examples");
  for (const template of templates) {
    await button(page, `观摩${template.name}`).click();
    const colors = await canvasPixels(page, ".study-scene canvas");
    await snap(page, `overview-${template.id}`);
    const canvas = page.locator(".study-scene canvas");
    const before = await canvas.evaluate((c) => c.toDataURL());
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.48, { steps: 10 });
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate((c) => c.toDataURL()), before, "Rotation did not update the scene");
    await button(page, "放大范例").click();
    await snap(page, `template-${template.id}`);
    await button(page, "搭建提示").click();
    for (const module of template.modules) {
      await button(page, module.name).click();
      assert.equal(await page.locator(".hint-content li").count(), 3);
      assert.match(await page.locator(".hint-materials").innerText(), /×|砂/);
    }
    await snap(page, `hint-${template.id}`);
    await button(page, "全部范例").click();
    results.push({ template: template.id, colors, modules: 3, status: "passed" });
  }
  const paused = await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-active-draft")).meta.seconds);
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-active-draft")).meta.seconds), paused, "Preview added creation time");
  await button(page, "返回建造").click();
  await button(page, "保存庭院").click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3"))), baseline);
  console.log("desktop: examples, hints, draft isolation passed");

  await button(page, "发布作品").click();
  await page.getByLabel("作品名称", { exact: true }).fill("石间小庭");
  await page.getByLabel("署名", { exact: true }).fill("庭园测试者");
  await page.getByRole("checkbox").check();
  await button(page, "确认发布").click();
  await page.getByRole("heading", { name: "庭院已入册" }).waitFor();
  await snap(page, "published");
  await button(page, "去作品广场").click();
  await button(page, "查看石间小庭").waitFor();
  const list = await (await alice.request.get(`${baseURL}/api/works`)).json();
  assert.equal(list.works.length, 1);
  const work = list.works[0];
  assert.equal(work.mine, true);
  const detail = await (await alice.request.get(`${baseURL}/api/works/${work.id}`)).json();
  assert.deepEqual(detail.garden, baseline);
  await button(page, "返回建造").click();
  await button(page, "发布作品").click();
  await page.getByRole("checkbox").check();
  await button(page, "确认发布").click();
  await page.getByRole("heading", { name: "庭院已入册" }).waitFor();
  assert.equal((await (await alice.request.get(`${baseURL}/api/works`)).json()).works.length, 1, "Duplicate publish created a second work");
  await button(page, "关闭发布").click();
  await page.reload({ waitUntil: "networkidle" });
  await button(page, "保存庭院").click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3"))), baseline);
  console.log("desktop: publish, idempotency and draft reload passed");

  const bob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce" });
  const phone = await bob.newPage(); track(phone);
  await phone.goto(baseURL, { waitUntil: "networkidle" });
  await canvasPixels(phone, ".editor-scene canvas");
  await button(phone, "保存庭院").click();
  const phoneBaseline = await phone.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3")));
  await layout(phone);
  await button(phone, "作品广场").click();
  await button(phone, "查看石间小庭").waitFor();
  await snap(phone, "mobile-gallery");
  await layout(phone);
  await button(phone, "查看石间小庭").click();
  await canvasPixels(phone, ".study-scene canvas");
  assert.equal(await button(phone, "移除作品").count(), 0);
  await button(phone, "0 份心意").click();
  await button(phone, "1 份心意").waitFor();
  assert.equal((await bob.request.delete(`${baseURL}/api/works/${work.id}`)).status(), 403);
  assert.equal((await bob.request.post(`${baseURL}/api/works`, { data: { consent: true, garden: {} } })).status(), 400);
  assert.equal((await bob.request.post(`${baseURL}/api/works/${work.id}/like`, { headers: { Origin: "https://example.invalid" }, data: { liked: false } })).status(), 403);
  await snap(phone, "mobile-work");
  await button(phone, "返回建造").click();
  await button(phone, "庭院范例").click();
  await button(phone, "观摩一坪梅影").click();
  await canvasPixels(phone, ".study-scene canvas");
  await button(phone, "搭建提示").click();
  await button(phone, "一人茶席").click();
  await snap(phone, "mobile-hint");
  await button(phone, "从空庭试搭").click();
  await button(phone, "开始试搭").click();
  await button(phone, "保存庭院").click();
  const challenge = await phone.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3")));
  assert.equal(challenge.size, 7); assert.equal(challenge.objects.length, 0);
  assert.deepEqual(await phone.evaluate(() => JSON.parse(localStorage.getItem("niwa-previous-draft")).garden), phoneBaseline);
  phone.once("dialog", (dialog) => dialog.accept());
  await button(phone, "恢复上一份草稿").click();
  await button(phone, "保存庭院").click();
  assert.deepEqual(await phone.evaluate(() => JSON.parse(localStorage.getItem("niwa-garden-v3"))), phoneBaseline);
  await phone.setViewportSize({ width: 320, height: 640 });
  await layout(phone);
  await button(phone, "物品目录").click();
  await page.waitForTimeout(500);
  await layout(phone);
  await snap(phone, "small-mobile-catalogue");
  await phone.getByRole("navigation", { name: "工坊页面" }).getByRole("button", { name: "作品广场", exact: true }).click();
  await button(phone, "查看石间小庭").waitFor();
  await button(phone, "我的作品").click();
  await phone.getByText("还没有作品，第一座庭院正在等你。").waitFor();
  await phone.route("**/api/works?**", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "测试暂时离线" }),
  }));
  await button(phone, "刷新作品").click();
  await phone.getByRole("alert").filter({ hasText: "测试暂时离线" }).waitFor();
  await phone.unroute("**/api/works?**");
  await button(phone, "重试").click();
  await phone.getByText("还没有作品，第一座庭院正在等你。").waitFor();
  console.log("mobile: shared gallery, ownership, hints and recovery passed");

  await new Promise((resolve) => server.close(resolve));
  server = createCommunityServer({ dbPath }); server.listen(port, "127.0.0.1"); await once(server, "listening");
  const restored = await (await bob.request.get(`${baseURL}/api/works/${work.id}`)).json();
  assert.equal(restored.likes, 1);
  assert.deepEqual(restored.garden, baseline);
  assert.equal((await bob.request.get(`${baseURL}/api/works/${work.id}/thumbnail`)).status(), 200);
  assert.equal((await alice.request.delete(`${baseURL}/api/works/${work.id}`)).status(), 200);
  assert.equal((await bob.request.get(`${baseURL}/api/works/${work.id}`)).status(), 404);
  assert.deepEqual(errors, []);
  results.push({ name: "publish-other-player-ownership-restart", status: "passed" }, { name: "mobile-layout-challenge-recovery", status: "passed" });
  await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await alice.close(); await bob.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
