import { createHash, randomBytes } from "node:crypto";
import { BlobError, BlobPreconditionFailedError, del, get, put } from "@vercel/blob";
import { fail, validateWork } from "./community-validation.mjs";

const ROOT = "niwa-community/v1";
const INDEX_PATH = `${ROOT}/index.json`;
const workPath = (id) => `${ROOT}/works/${id}.json`;
const thumbnailPath = (id) => `${ROOT}/thumbnails/${id}.jpg`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function workId(owner, draftId) {
  const bytes = Buffer.from(hash(`${owner}:${draftId}`), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.subarray(0, 16).toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function readJson(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) throw new Error(`Unexpected Blob response for ${pathname}`);
  return {
    value: JSON.parse(await new Response(result.stream).text()),
    etag: result.blob.etag,
  };
}

function emptyIndex() {
  return { version: 1, works: [] };
}

function validIndex(value) {
  return value?.version === 1 && Array.isArray(value.works);
}

export function createBlobCommunityStore() {
  const readIndex = async () => {
    const saved = await readJson(INDEX_PATH);
    if (!saved) return { index: emptyIndex(), etag: null };
    if (!validIndex(saved.value)) throw new Error("Community index is invalid");
    return { index: saved.value, etag: saved.etag };
  };
  return {
    readIndex,
    async mutateIndex(transform) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const current = await readIndex();
        const change = transform(structuredClone(current.index));
        try {
          await put(INDEX_PATH, JSON.stringify(change.index), {
            access: "private",
            contentType: "application/json",
            cacheControlMaxAge: 60,
            ...(current.etag ? { ifMatch: current.etag } : {}),
          });
          return change.value;
        } catch (error) {
          const creationRace = !current.etag && error instanceof BlobError &&
            /already exists|overwrite|precondition/i.test(error.message);
          if (error instanceof BlobPreconditionFailedError || creationRace) continue;
          throw error;
        }
      }
      throw fail(503, "作品广场正忙，请稍后重试");
    },
    async readWork(id) {
      return (await readJson(workPath(id)))?.value ?? null;
    },
    async writeWork(id, value) {
      await put(workPath(id), JSON.stringify(value), {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
    },
    async readThumbnail(id) {
      const result = await get(thumbnailPath(id), { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async writeThumbnail(id, value) {
      await put(thumbnailPath(id), value, {
        access: "private",
        allowOverwrite: true,
        contentType: "image/jpeg",
        cacheControlMaxAge: 60,
      });
    },
    async deleteAssets(id) {
      await del([workPath(id), thumbnailPath(id)]);
    },
  };
}

export function createMemoryCommunityStore() {
  let index = emptyIndex();
  const works = new Map(), thumbnails = new Map();
  return {
    async readIndex() {
      return { index: structuredClone(index), etag: "memory" };
    },
    async mutateIndex(transform) {
      const change = transform(structuredClone(index));
      index = structuredClone(change.index);
      return change.value;
    },
    async readWork(id) {
      return structuredClone(works.get(id) ?? null);
    },
    async writeWork(id, value) {
      works.set(id, structuredClone(value));
    },
    async readThumbnail(id) {
      const value = thumbnails.get(id);
      return value ? Buffer.from(value) : null;
    },
    async writeThumbnail(id, value) {
      thumbnails.set(id, Buffer.from(value));
    },
    async deleteAssets(id) {
      works.delete(id);
      thumbnails.delete(id);
    },
  };
}

function publicWork(row, owner) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    seconds: row.seconds,
    templateId: row.templateId,
    size: row.size,
    objectCount: row.objectCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mine: row.owner === owner,
    liked: row.likes.includes(owner),
    likes: row.likes.length,
    thumbnailUrl: `/api/works/${row.id}/thumbnail?v=${encodeURIComponent(row.updatedAt)}`,
  };
}

async function jsonBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw fail(415, "仅接受JSON");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 2_000_000) throw fail(413, "作品数据过大");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2_000_000) throw fail(413, "作品数据过大");
  try {
    return JSON.parse(raw);
  } catch {
    throw fail(400, "JSON无效");
  }
}

function routePath(url) {
  const rewritten = url.searchParams.get("path");
  if (rewritten !== null) return rewritten.replace(/^\/+|\/+$/g, "");
  return url.pathname.replace(/^\/api\/?/, "").replace(/^community\/?/, "").replace(/^\/+|\/+$/g, "");
}

export function createCommunityHandler(store = createBlobCommunityStore()) {
  const rate = new Map();
  return async function handle(request) {
    const url = new URL(request.url);
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
    const cookies = request.headers.get("cookie")?.split(";").map((item) => item.trim()) ?? [];
    let token = cookies.find((item) => item.startsWith("niwa_guest="))?.slice(11);
    if (!/^[a-f0-9]{64}$/.test(token ?? "")) {
      token = randomBytes(32).toString("hex");
      const secure = url.protocol === "https:" || process.env.VERCEL === "1" ? "; Secure" : "";
      headers.set("Set-Cookie", `niwa_guest=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`);
    }
    const owner = hash(token);
    const respond = (status, value, extraHeaders) => {
      const responseHeaders = new Headers(headers);
      responseHeaders.set("Content-Type", "application/json; charset=utf-8");
      for (const [name, headerValue] of Object.entries(extraHeaders ?? {})) responseHeaders.set(name, headerValue);
      return new Response(JSON.stringify(value), { status, headers: responseHeaders });
    };

    try {
      const path = routePath(url);
      if (request.method !== "GET" && request.headers.get("origin")) {
        let origin;
        try {
          origin = new URL(request.headers.get("origin"));
        } catch {
          throw fail(403, "请求来源不符");
        }
        if (origin.host !== url.host) throw fail(403, "请求来源不符");
      }
      if (request.method === "GET" && path === "health") {
        await store.readIndex();
        return respond(200, { ok: true, storage: "vercel-blob" });
      }
      if (request.method === "GET" && path === "works") {
        const { index } = await store.readIndex();
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw fail(400, "分页参数无效");
        const mine = url.searchParams.get("mine") === "1";
        const rows = index.works.filter((row) => !mine || row.owner === owner).sort((a, b) => {
          if (url.searchParams.get("sort") === "likes" && b.likes.length !== a.likes.length) return b.likes.length - a.likes.length;
          return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
        }).slice(offset, offset + 13);
        return respond(200, { works: rows.slice(0, 12).map((row) => publicWork(row, owner)), hasMore: rows.length > 12 });
      }
      if (request.method !== "GET") {
        const now = Date.now();
        const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        if (rate.size > 10000) rate.clear();
        const previous = rate.get(key);
        const next = !previous || now > previous.until ? { count: 1, until: now + 60000 } :
          { count: previous.count + 1, until: previous.until };
        rate.set(key, next);
        if (next.count > 60) throw fail(429, "操作太频繁，请稍后再试");
      }
      if (request.method === "POST" && path === "works") {
        const work = validateWork(await jsonBody(request));
        const { index } = await store.readIndex();
        const current = index.works.find((row) => row.owner === owner && row.draftId === work.draftId);
        if (!current && index.works.filter((row) => row.owner === owner).length >= 100) {
          throw fail(429, "个人作品已达100件，请先整理作品");
        }
        if (!current && index.works.length >= 1000) throw fail(429, "作品广场暂时已满");
        const id = current?.id ?? workId(owner, work.draftId);
        const updatedAt = new Date().toISOString();
        await Promise.all([
          store.writeWork(id, { garden: work.garden, environment: work.environment }),
          store.writeThumbnail(id, work.thumbnail),
        ]);
        const saved = await store.mutateIndex((latest) => {
          const previous = latest.works.find((row) => row.owner === owner && row.draftId === work.draftId);
          if (!previous && latest.works.filter((row) => row.owner === owner).length >= 100) {
            throw fail(429, "个人作品已达100件，请先整理作品");
          }
          if (!previous && latest.works.length >= 1000) throw fail(429, "作品广场暂时已满");
          const entry = {
            id,
            owner,
            draftId: work.draftId,
            title: work.title,
            author: work.author,
            seconds: work.seconds,
            templateId: work.templateId,
            size: work.garden.size,
            objectCount: work.garden.objects.length,
            createdAt: previous?.createdAt ?? updatedAt,
            updatedAt,
            likes: previous?.likes ?? [],
          };
          latest.works = [...latest.works.filter((row) => row.id !== id), entry];
          return { index: latest, value: { entry, created: !previous } };
        });
        return respond(saved.created ? 201 : 200, publicWork(saved.entry, owner));
      }

      const match = path.match(/^works\/([a-f0-9-]{36})(?:\/(thumbnail|like))?$/);
      if (!match) throw fail(404, "未找到作品");
      const [, id, action] = match;
      if (request.method === "GET" && action === "thumbnail") {
        const { index } = await store.readIndex();
        if (!index.works.some((row) => row.id === id)) throw fail(404, "作品已不存在");
        const thumbnail = await store.readThumbnail(id);
        if (!thumbnail) throw fail(404, "作品封面已不存在");
        const responseHeaders = new Headers(headers);
        responseHeaders.set("Content-Type", "image/jpeg");
        responseHeaders.set("Cache-Control", "private, max-age=60");
        return new Response(thumbnail, { status: 200, headers: responseHeaders });
      }
      if (request.method === "GET" && !action) {
        const { index } = await store.readIndex();
        const row = index.works.find((item) => item.id === id);
        if (!row) throw fail(404, "作品已不存在");
        const detail = await store.readWork(id);
        if (!detail) throw fail(404, "作品已不存在");
        return respond(200, { ...publicWork(row, owner), garden: detail.garden, environment: detail.environment });
      }
      if (request.method === "POST" && action === "like") {
        const data = await jsonBody(request);
        if (typeof data?.liked !== "boolean") throw fail(400, "心意状态无效");
        const row = await store.mutateIndex((latest) => {
          const position = latest.works.findIndex((item) => item.id === id);
          if (position < 0) throw fail(404, "作品已不存在");
          const current = latest.works[position];
          if (current.owner === owner) throw fail(400, "不能为自己的作品点心意");
          const likes = new Set(current.likes);
          if (data.liked) likes.add(owner);
          else likes.delete(owner);
          const updated = { ...current, likes: [...likes] };
          latest.works[position] = updated;
          return { index: latest, value: updated };
        });
        return respond(200, publicWork(row, owner));
      }
      if (request.method === "DELETE" && !action) {
        await store.mutateIndex((latest) => {
          const row = latest.works.find((item) => item.id === id);
          if (!row) throw fail(404, "作品已不存在");
          if (row.owner !== owner) throw fail(403, "只能移除自己发布的作品");
          latest.works = latest.works.filter((item) => item.id !== id);
          return { index: latest, value: row };
        });
        try {
          await store.deleteAssets(id);
        } catch (error) {
          console.error("Failed to remove orphaned community assets", error);
        }
        return respond(200, { ok: true });
      }
      throw fail(405, "请求方法无效");
    } catch (error) {
      if (!error?.status) console.error(error);
      return respond(error?.status ?? 500, {
        error: error?.status ? error.message : "服务暂时不可用，请稍后重试",
      });
    }
  };
}
