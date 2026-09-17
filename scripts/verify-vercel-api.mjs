import assert from "node:assert/strict";
import { createCommunityHandler, createMemoryCommunityStore } from "../server/blob-community.mjs";
import { createInitialGarden } from "../src/game/model.ts";

const base = "http://niwa.test/api/community";
const store = createMemoryCommunityStore();
let handler = createCommunityHandler(store);

async function request(path, { method = "GET", cookie, data, origin = "http://niwa.test" } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (method !== "GET") headers.set("Origin", origin);
  if (data !== undefined) headers.set("Content-Type", "application/json");
  const response = await handler(new Request(`${base}?path=${encodeURIComponent(path)}`, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  }));
  return response;
}

const aliceHealth = await request("health");
assert.equal(aliceHealth.status, 200);
assert.deepEqual(await aliceHealth.json(), { ok: true, storage: "vercel-blob" });
const alice = aliceHealth.headers.get("set-cookie").split(";")[0];

const garden = createInitialGarden();
const jpeg = Buffer.alloc(120);
jpeg[0] = 0xff;
jpeg[1] = 0xd8;
jpeg[jpeg.length - 2] = 0xff;
jpeg[jpeg.length - 1] = 0xd9;
const publication = {
  title: "石间小庭",
  author: "庭园测试者",
  draftId: "draft-12345678",
  seconds: 180,
  consent: true,
  garden,
  environment: { hour: 9.5, season: "spring", weather: "clear" },
  templateId: null,
  thumbnail: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
};

const createdResponse = await request("works", { method: "POST", cookie: alice, data: publication });
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.equal(created.mine, true);
assert.equal(created.likes, 0);

const updatedResponse = await request("works", {
  method: "POST",
  cookie: alice,
  data: { ...publication, title: "石间小庭（二稿）" },
});
assert.equal(updatedResponse.status, 200);
assert.equal((await updatedResponse.json()).id, created.id);

const aliceList = await request("works", { cookie: alice });
const aliceWorks = (await aliceList.json()).works;
assert.equal(aliceWorks.length, 1);
assert.equal(aliceWorks[0].title, "石间小庭（二稿）");
assert.equal(aliceWorks[0].mine, true);

const detailResponse = await request(`works/${created.id}`, { cookie: alice });
assert.equal(detailResponse.status, 200);
assert.deepEqual((await detailResponse.json()).garden, garden);
const thumbnailResponse = await request(`works/${created.id}/thumbnail`, { cookie: alice });
assert.equal(thumbnailResponse.status, 200);
assert.equal(thumbnailResponse.headers.get("content-type"), "image/jpeg");
assert.deepEqual(Buffer.from(await thumbnailResponse.arrayBuffer()), jpeg);

const bobHealth = await request("health");
const bob = bobHealth.headers.get("set-cookie").split(";")[0];
const bobList = await request("works", { cookie: bob });
assert.equal((await bobList.json()).works[0].mine, false);
const likedResponse = await request(`works/${created.id}/like`, {
  method: "POST",
  cookie: bob,
  data: { liked: true },
});
assert.equal(likedResponse.status, 200);
assert.equal((await likedResponse.json()).likes, 1);

handler = createCommunityHandler(store);
const restored = await request(`works/${created.id}`, { cookie: bob });
assert.equal((await restored.json()).likes, 1);
assert.equal((await request(`works/${created.id}`, { method: "DELETE", cookie: bob })).status, 403);
assert.equal((await request(`works/${created.id}/like`, {
  method: "POST",
  cookie: alice,
  data: { liked: true },
})).status, 400);
assert.equal((await request(`works/${created.id}/like`, {
  method: "POST",
  cookie: bob,
  data: { liked: false },
  origin: "https://example.invalid",
})).status, 403);

assert.equal((await request(`works/${created.id}`, { method: "DELETE", cookie: alice })).status, 200);
assert.equal((await request(`works/${created.id}`, { cookie: bob })).status, 404);
console.log("Vercel community API: publish, update, persistence, likes, ownership and deletion passed");
